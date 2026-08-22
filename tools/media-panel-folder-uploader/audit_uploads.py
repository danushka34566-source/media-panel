#!/usr/bin/env python3
"""Audit and safely recover files recorded by ``upload_folder.py``.

The uploader's ``upload-data.json`` is the source of truth for the local
source path, allocated Drive key, and byte fingerprint.  This utility checks
the authenticated Drive object for every completed record and can re-upload
only records whose local bytes still match the manifest and whose remote
object is missing or has a different size.  It is audit-only unless
``--reupload`` is explicitly supplied.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import re
from pathlib import Path
from typing import Any

from upload_folder import (
    DEFAULT_STATE_PATH,
    DriveClient,
    StateLock,
    StateStore,
    UploadError,
    append_trace,
    load_credential_store,
    source_matches_record,
    unprotect_api_key,
    upload_file,
    utc_now,
)


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        values[name.strip()] = value.strip().strip('"').strip("'")
    return values


def _key_from_storage_url(url: str, drive_url: str, bucket: str) -> str:
    parsed = urllib.parse.urlsplit(url.split("?", 1)[0])
    base = urllib.parse.urlsplit(drive_url.rstrip("/"))
    prefix = f"{base.path.rstrip('/')}/{bucket.strip('/')}/"
    if parsed.netloc != base.netloc or not parsed.path.startswith(prefix):
        return ""
    return "/".join(
        urllib.parse.unquote(part) for part in parsed.path[len(prefix):].split("/") if part
    )


def _derive_title(file_name: str) -> str:
    stem = Path(file_name).name
    if "." in stem:
        stem = stem.rsplit(".", 1)[0]
    return " ".join(stem.replace("-", " ").replace("_", " ").split())


def _is_generated_artifact(key: str) -> bool:
    name = Path(key).name.casefold()
    return bool(
        re.match(r"^\d{12}-(?:poster|preview)\.[a-z0-9]+$", name)
        or name.endswith(".m3u8")
        or re.match(r"^\d{12}-segment-", name)
        or re.match(r"^\d{12}-hls-", name)
    )


_MEDIA_EXTENSIONS = {
    "jpg", "jpeg", "png", "mp4", "mov", "webm", "mkv", "m4v", "avi",
    "ts", "m2ts", "mts", "mpg", "mpeg", "wmv", "flv", "3gp", "ogv",
}


def _load_registration_snapshot(
    postgres_url: str,
    disable_ssl: str,
    drive_url: str,
    bucket: str,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Load durable map/status/title data; every query is read-only."""
    if not postgres_url:
        return {}
    empty: dict[str, dict[str, dict[str, Any]]] = {
        "by_source": {},
        "by_name": {},
        "status_by_source": {},
        "status_by_name": {},
    }
    try:
        import psycopg
    except ImportError as error:
        raise UploadError("psycopg is required for --postgres-url map reconciliation") from error
    connect_options: dict[str, Any] = {"connect_timeout": 15}
    if disable_ssl.strip() in {"1", "true", "yes", "on"}:
        connect_options["sslmode"] = "disable"
    try:
        with psycopg.connect(postgres_url, **connect_options) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT f.media_id, f.original_file_name, f.stored_file_name, "
                    "f.stored_url, f.source_url, m.title "
                    "FROM registered_upload_file_map f "
                    "LEFT JOIN media m ON m.id = f.media_id"
                )
                map_rows = cursor.fetchall()
                cursor.execute(
                    "SELECT url, source_url, status, media_id, original_file_name, "
                    "title, error_message, updated_at "
                    "FROM worker_registration_status"
                )
                status_rows = cursor.fetchall()
    except Exception as error:
        raise UploadError(f"Unable to read registered upload map: {error}") from error
    result = empty
    for media_id, original_file_name, stored_file_name, stored_url, source_url, title in map_rows:
        stored_key = _key_from_storage_url(str(stored_url or ""), drive_url, bucket)
        source_key = _key_from_storage_url(str(source_url or ""), drive_url, bucket)
        item = {
                "media_id": str(media_id or ""),
                "original_file_name": str(original_file_name or "") or None,
                "stored_file_name": str(stored_file_name or "") or None,
                "stored_key": stored_key or None,
                "stored_url": str(stored_url or "") or None,
                "title": str(title or "") or None,
            }
        if source_key:
            result["by_source"][source_key] = item
        name = str(original_file_name or "").strip().casefold()
        if name:
            result["by_name"].setdefault(name, []).append(item)
    for url, source_url, status, media_id, original_file_name, title, error_message, updated_at in status_rows:
        source_key = _key_from_storage_url(str(source_url or url or ""), drive_url, bucket)
        item = {
            "status": str(status or ""),
            "media_id": str(media_id or "") or None,
            "original_file_name": str(original_file_name or "") or None,
            "title": str(title or "") or None,
            "error_message": str(error_message or "") or None,
            "updated_at": str(updated_at or "") or None,
        }
        if source_key:
            result["status_by_source"][source_key] = item
        name = str(original_file_name or "").strip().casefold()
        if name:
            result["status_by_name"].setdefault(name, []).append(item)
    return result


def _folder_identity(folder: Path) -> str:
    value = str(folder.resolve())
    return value.casefold() if os.name == "nt" else value


def _load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise UploadError(f"Unable to read upload state {path}: {error}") from error
    if not isinstance(data, dict) or data.get("version") != 2:
        raise UploadError(
            f"Unsupported upload state {path}; expected uploader state version 2"
        )
    if not isinstance(data.get("folders"), dict):
        raise UploadError(f"Upload state {path} has no folder records")
    return data


def _select_folder(
    root: dict[str, Any],
    requested: Path | None,
    profile: str | None,
) -> tuple[Path, dict[str, Any]]:
    candidates: list[tuple[Path, dict[str, Any]]] = []
    for key, value in root["folders"].items():
        if not isinstance(value, dict):
            continue
        folder_value = value.get("folder")
        if not folder_value:
            continue
        if profile and str(value.get("profile", "default")) != profile:
            continue
        folder = Path(str(folder_value)).expanduser().resolve()
        if requested is not None and folder != requested.resolve():
            continue
        candidates.append((folder, value))
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        detail = f" for {requested}" if requested else ""
        raise UploadError(f"No uploader folder record found{detail}")
    names = ", ".join(str(folder) for folder, _ in candidates)
    raise UploadError(
        "State contains multiple folder records; pass --folder (or --profile). "
        f"Available: {names}"
    )


def _credential_for_profile(profile: str) -> str:
    store = load_credential_store()
    profiles = store.get("profiles", {})
    entry = profiles.get(profile) if isinstance(profiles, dict) else None
    if not isinstance(entry, dict):
        return ""
    encrypted = str(entry.get("api_key", ""))
    if not encrypted:
        return ""
    return unprotect_api_key(encrypted)


def _drive_origin(drive_url: str) -> str:
    parsed = urllib.parse.urlsplit(drive_url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise UploadError("State drive_url must be a full http:// or https:// URL")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


class DriveObjectAudit:
    def __init__(
        self,
        drive_url: str,
        api_key: str,
        project_id: str,
        bucket: str,
        timeout: int,
        retries: int,
    ) -> None:
        self.origin = _drive_origin(drive_url)
        self.api_key = api_key.strip()
        self.project_id = project_id.strip()
        self.bucket = bucket.strip()
        self.timeout = max(1, timeout)
        self.retries = max(0, retries)

    def list_inventory(self) -> dict[str, int | None]:
        """Read one authenticated bucket inventory before falling back to HEADs."""
        query = urllib.parse.urlencode({
            "projectId": self.project_id,
            "bucket": self.bucket,
            "limit": "10000",
        })
        url = f"{self.origin}/api/v1/storage/list?{query}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-Drive-Project": self.project_id,
            "X-Drive-Bucket": self.bucket,
            "User-Agent": "media-panel-upload-audit/1",
        }
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                with urllib.request.urlopen(
                    urllib.request.Request(url, headers=headers),
                    timeout=self.timeout,
                ) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                objects = payload.get("objects", []) if isinstance(payload, dict) else []
                inventory: dict[str, int | None] = {}
                for item in objects:
                    if not isinstance(item, dict):
                        continue
                    key = str(item.get("key") or item.get("fileName") or "").strip()
                    if not key:
                        continue
                    raw_size = item.get("size")
                    try:
                        size = int(raw_size) if raw_size is not None else None
                    except (TypeError, ValueError):
                        size = None
                    inventory[key] = size
                return inventory
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
                last_error = error
            if attempt < self.retries:
                time.sleep(min(2 ** attempt, 8))
        raise UploadError(f"Drive inventory request failed: {last_error}")

    def head(self, key: str) -> dict[str, Any]:
        encoded = "/".join(urllib.parse.quote(part, safe="") for part in key.split("/"))
        url = f"{self.origin}/api/v1/storage/object/{encoded}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-Drive-Project": self.project_id,
            "X-Drive-Bucket": self.bucket,
            "User-Agent": "media-panel-upload-audit/1",
        }
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            request = urllib.request.Request(url, method="HEAD", headers=headers)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw_size = response.headers.get("Content-Length")
                    size = int(raw_size) if raw_size is not None else None
                    return {"state": "present", "status": response.status, "size": size}
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    return {"state": "missing", "status": 404, "size": None}
                last_error = error
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
                last_error = error
            if attempt < self.retries:
                time.sleep(min(2 ** attempt, 8))
        return {
            "state": "error",
            "status": getattr(last_error, "code", None),
            "size": None,
            "error": str(last_error or "Drive HEAD failed"),
        }


def _check_record(
    item: tuple[str, dict[str, Any]],
    folder: Path,
    drive: DriveObjectAudit,
    inventory: dict[str, int | None] | None,
    registration_snapshot: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, Any]:
    source, record = item
    path = folder / source
    expected_size = int(record.get("fingerprint", {}).get("size", -1))
    result: dict[str, Any] = {
        "source": source,
        "key": str(record.get("key", "")),
        "status": str(record.get("status", "")),
        "expected_size": expected_size,
        "local": "missing",
        "remote": "unknown",
        "classification": "invalid_record",
        "original_file_name": str(record.get("original_file_name") or Path(source).name),
    }
    result["derived_title"] = _derive_title(result["original_file_name"])
    if Path(source).suffix.casefold().lstrip(".") not in _MEDIA_EXTENSIONS:
        result["classification"] = "non_media_record"
    try:
        if path.is_file() and source_matches_record(path, record):
            result["local"] = "match"
        elif path.exists():
            result["local"] = "changed"
    except (OSError, KeyError, TypeError, ValueError):
        result["local"] = "changed"
    key = str(record.get("key", "")).strip()
    if key:
        if inventory is not None and key not in inventory:
            remote = {"state": "missing", "status": 404, "size": None}
        elif inventory is not None and inventory.get(key) is not None:
            remote = {"state": "present", "status": 200, "size": inventory[key]}
        else:
            remote = drive.head(key)
        result.update({"remote": remote.get("state", "error"), "remote_status": remote.get("status"), "remote_size": remote.get("size")})
        name_key = result["original_file_name"].strip().casefold()
        mapped = registration_snapshot.get("by_source", {}).get(key)
        if mapped is None:
            same_name = registration_snapshot.get("by_name", {}).get(name_key, [])
            mapped = same_name[0] if len(same_name) == 1 else None
        status_row = registration_snapshot.get("status_by_source", {}).get(key)
        if status_row is None:
            same_name_status = registration_snapshot.get("status_by_name", {}).get(name_key, [])
            status_row = same_name_status[0] if len(same_name_status) == 1 else None
        if status_row:
            result["registration_status"] = status_row.get("status")
            result["title"] = status_row.get("title") or (mapped or {}).get("title") or result["derived_title"]
            result["registration_error"] = status_row.get("error_message")
        elif mapped:
            result["title"] = mapped.get("title") or result["derived_title"]
        else:
            result["title"] = result["derived_title"]
        if remote.get("state") == "present":
            if result["classification"] == "non_media_record":
                pass
            elif mapped:
                result["classification"] = "registered"
            elif status_row and status_row.get("status") in {"detected", "registering", "error"}:
                result["classification"] = "registration_in_progress"
            else:
                result["classification"] = "unregistered_present"
            if remote.get("size") != expected_size:
                result["classification"] = "size_mismatch"
        elif remote.get("state") == "missing":
            stored_key = str((mapped or {}).get("stored_key") or "")
            if mapped and stored_key and inventory is not None and stored_key in inventory:
                result["classification"] = "registered_source_removed"
                result["registered_media_id"] = mapped.get("media_id")
                result["registered_key"] = stored_key
            elif mapped:
                result["classification"] = "registered_copy_missing"
                result["registered_media_id"] = mapped.get("media_id")
                result["registered_key"] = stored_key or None
            elif status_row and status_row.get("status") in {"detected", "registering", "error"}:
                result["classification"] = "registration_in_progress"
            else:
                result["classification"] = "missing_remote_unmapped"
        else:
            result["classification"] = "remote_check_error"
            result["error"] = remote.get("error")
    return result


def _reset_for_reupload(record: dict[str, Any]) -> None:
    for key in ("upload_id", "completed_at", "storage_confirmation"):
        record.pop(key, None)
    record.update(
        status="pending",
        status_message="Recovery upload queued",
        last_error=None,
        uploaded_bytes=0,
        part_count=0,
        completed_part_count=0,
        parts={},
        updated_at=utc_now(),
    )
    append_trace(record, "recovery_reupload_queued")


def _print_report(report: dict[str, Any]) -> None:
    counts = report["counts"]
    print(
        f"Audited {report['audited']} completed upload record(s): "
        f"{counts.get('registered', 0)} registered, "
        f"{counts.get('registration_in_progress', 0)} in progress, "
        f"{counts.get('unregistered_present', 0)} unregistered in Drive, "
        f"{counts.get('registered_source_removed', 0)} source files cleaned after registration, "
        f"{counts.get('missing_remote_unmapped', 0)} missing/unmapped, "
        f"{counts.get('size_mismatch', 0)} size mismatch, "
        f"{counts.get('remote_check_error', 0)} check error; "
        f"{report.get('drive_untracked_count', 0)} untracked source object(s), "
        f"{report.get('drive_generated_artifact_count', 0)} generated artifact(s)."
    )
    for item in report["records"]:
        if item["classification"] in {
            "missing_remote_unmapped", "registered_copy_missing", "size_mismatch",
            "remote_check_error",
        }:
            extra = item.get("error") or f"remote={item.get('remote_size')} expected={item.get('expected_size')}"
            print(f"{item['classification']}: {item['source']} ({extra})")
    if report.get("reuploaded"):
        print(f"Re-uploaded {report['reuploaded']} record(s).")
    if report.get("reupload_failed"):
        print(f"Re-upload failed for {report['reupload_failed']} record(s).")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify uploader records against Drive and optionally re-upload missing objects."
    )
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--folder", type=Path, help="Folder record to audit when state has more than one")
    parser.add_argument("--profile", default=None, help="Limit selection to one uploader profile")
    parser.add_argument("--drive-api-key", default=os.getenv("DRIVE_STORAGE_API_KEY", ""))
    parser.add_argument("--postgres-url", default=os.getenv("POSTGRES_URL", ""), help="Read-only database URL for source/stored registration reconciliation")
    parser.add_argument("--env-file", type=Path, help="Optional dotenv file for credentials and POSTGRES_URL")
    parser.add_argument("--allow-unmapped-reupload", action="store_true", help="Allow re-upload when no registration map can be read")
    parser.add_argument("--project-id", default=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", ""))
    parser.add_argument("--bucket", default=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", ""))
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--include-pending", action="store_true", help="Audit records not marked uploaded too")
    parser.add_argument("--reupload", action="store_true", help="Re-upload confirmed missing/mismatched local files")
    parser.add_argument("--part-size-mb", type=int, default=8)
    parser.add_argument("--part-workers", type=int, default=4)
    parser.add_argument("--part-retries", type=int, default=3)
    parser.add_argument("--request-timeout", type=int, default=120)
    parser.add_argument("--report", type=Path, help="Write the detailed JSON report to this path")
    parser.add_argument("--verbose", action="store_true", help="Print every source classification")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env_file = args.env_file
    if env_file is None:
        candidate = Path(__file__).resolve().parents[2] / ".env"
        env_file = candidate if candidate.exists() else None
    dotenv = _load_env_file(env_file) if env_file else {}
    state_path = args.state.expanduser().resolve()
    root = _load_json(state_path)
    folder, folder_data = _select_folder(root, args.folder, args.profile)
    profile = str(folder_data.get("profile", "default"))
    drive_url = str(folder_data.get("drive_url", "")).strip()
    api_key = str(args.drive_api_key or dotenv.get("DRIVE_STORAGE_API_KEY", "")).strip() or _credential_for_profile(profile)
    project_id = str(args.project_id or dotenv.get("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", "") or folder_data.get("project_id", "")).strip()
    bucket = str(args.bucket or dotenv.get("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", "") or folder_data.get("bucket", "")).strip()
    missing = [name for name, value in (("Drive API key", api_key), ("project ID", project_id), ("bucket", bucket), ("drive_url", drive_url)) if not value]
    if missing:
        raise UploadError(f"Missing required setting(s): {', '.join(missing)}")
    drive = DriveObjectAudit(drive_url, api_key, project_id, bucket, args.timeout, args.retries)
    try:
        inventory: dict[str, int | None] | None = drive.list_inventory()
    except UploadError as error:
        print(f"Drive inventory unavailable; falling back to authenticated HEAD checks: {error}", file=sys.stderr)
        inventory = None
    postgres_url = str(args.postgres_url or dotenv.get("POSTGRES_URL", "")).strip()
    try:
        registration_snapshot = _load_registration_snapshot(
            postgres_url,
            dotenv.get("DISABLE_POSTGRES_SSL", os.getenv("DISABLE_POSTGRES_SSL", "")),
            drive_url,
            bucket,
        )
    except UploadError as error:
        print(f"Registration map unavailable; missing objects will not be re-uploaded automatically: {error}", file=sys.stderr)
        registration_snapshot = {}
    records = folder_data.get("files", {})
    if not isinstance(records, dict):
        raise UploadError("Selected folder record has no files")
    selected = [
        (str(source), record)
        for source, record in records.items()
        if isinstance(record, dict) and (args.include_pending or record.get("status") == "uploaded")
    ]
    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(_check_record, item, folder, drive, inventory, registration_snapshot) for item in selected]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda item: str(item["source"]).casefold())
    counts: dict[str, int] = {}
    for item in results:
        counts[item["classification"]] = counts.get(item["classification"], 0) + 1
    report: dict[str, Any] = {
        "checked_at": utc_now(),
        "state": str(state_path),
        "folder": str(folder),
        "profile": profile,
        "audited": len(results),
        "counts": counts,
        "records": results,
        "reuploaded": 0,
        "reupload_failed": 0,
    }
    manifest_keys = {
        str(record.get("key", "")).strip()
        for record in records.values()
        if isinstance(record, dict)
        if str(record.get("key", "")).strip()
    }
    stored_keys = {
        str(item.get("stored_key", "")).strip()
        for item in registration_snapshot.get("by_source", {}).values()
        if str(item.get("stored_key", "")).strip()
    }
    if inventory is not None:
        generated_artifacts = sorted(key for key in inventory if _is_generated_artifact(key))
        report["drive_untracked"] = sorted(
            key for key in inventory
            if key not in manifest_keys and key not in stored_keys and not _is_generated_artifact(key)
        )
        report["drive_generated_artifacts"] = generated_artifacts
        report["drive_generated_artifact_count"] = len(generated_artifacts)
        report["drive_untracked_count"] = len(report["drive_untracked"])
        report["registered_destinations_missing"] = sorted({
            str(item.get("stored_key"))
            for item in registration_snapshot.get("by_source", {}).values()
            if item.get("stored_key") and str(item["stored_key"]) not in inventory
        })
    else:
        report["drive_untracked"] = None
        report["drive_untracked_count"] = None
        report["drive_generated_artifacts"] = None
        report["drive_generated_artifact_count"] = None
        report["registered_destinations_missing"] = None
    if args.verbose:
        for item in report["records"]:
            print(f"{item['classification']}: {item['source']}")
    if args.reupload:
        allowed_missing = {"missing_remote_unmapped"} if args.allow_unmapped_reupload else set()
        recoverable = [item for item in results if item["classification"] in ({"registered_copy_missing", "size_mismatch"} | allowed_missing) and item["local"] == "match"]
        if not recoverable:
            print("No confirmed missing or size-mismatched local files need re-upload.")
        else:
            with StateLock(state_path):
                store = StateStore(state_path, folder, drive_url, project_id, bucket, profile)
                client = DriveClient(drive_url, api_key, project_id, bucket, max(1, args.request_timeout))
                for item in recoverable:
                    record = store.data["files"].get(item["source"])
                    if not isinstance(record, dict):
                        continue
                    _reset_for_reupload(record)
                    store.save()
                    try:
                        upload_file(
                            client, store, folder, record,
                            max(5, args.part_size_mb) * 1024 * 1024,
                            max(1, args.part_workers),
                            max(0, args.part_retries),
                        )
                        item["reupload"] = "uploaded"
                        report["reuploaded"] += 1
                    except Exception as error:
                        record.update(status="error", last_error=str(error), updated_at=utc_now())
                        append_trace(record, "recovery_reupload_failed", error=str(error))
                        store.save()
                        item["reupload"] = "failed"
                        item["error"] = str(error)
                        report["reupload_failed"] += 1
    if args.report:
        report_path = args.report.expanduser().resolve()
        temporary = report_path.with_name(f"{report_path.name}.tmp")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, report_path)
    _print_report(report)
    return 1 if report.get("reupload_failed") else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (UploadError, OSError, json.JSONDecodeError) as error:
        print(f"Fatal: {error}", file=sys.stderr)
        raise SystemExit(2)
