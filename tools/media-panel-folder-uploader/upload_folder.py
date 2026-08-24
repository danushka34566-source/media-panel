#!/usr/bin/env python3
"""Resumable folder uploader for media-panel's Drive multipart API.

Uploads are staged only. The worker remains responsible for registration.
Credentials are never written to the state file.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import ctypes
import hashlib
import json
import mimetypes
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from ctypes import wintypes


STATE_VERSION = 2
# Keep private credentials and resumable upload traces outside the repository.
# LOCALAPPDATA is available for every Windows user and is created on demand.
# XDG_DATA_HOME provides the equivalent location on Linux/macOS environments.
DATA_DIRECTORY = Path(
    os.getenv("LOCALAPPDATA")
    or os.getenv("XDG_DATA_HOME")
    or (Path.home() / ".local" / "share")
) / "MediaPanelUploader"
DEFAULT_STATE_NAME = "upload-data.json"
DEFAULT_STATE_PATH = DATA_DIRECTORY / DEFAULT_STATE_NAME
SETTINGS_PATH = DATA_DIRECTORY / "uploader-settings.json"
CREDENTIALS_PATH = DATA_DIRECTORY / "credentials.json"
PRINT_LOCK = threading.Lock()


class UploadError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def format_bytes(value: int) -> str:
    amount = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if amount < 1024 or unit == "TB":
            return f"{amount:.1f} {unit}"
        amount /= 1024
    return f"{amount:.1f} TB"


def log(message: str) -> None:
    with PRINT_LOCK:
        try:
            print(message, flush=True)
        except (UnicodeEncodeError, OSError, ValueError):
            try:
                output = getattr(sys.stdout, "buffer", None)
                if output is not None:
                    output.write((message + "\n").encode("utf-8", errors="replace"))
                    output.flush()
                else:
                    print(message.encode("ascii", errors="replace").decode("ascii"), flush=True)
            except (OSError, ValueError):
                # Logging must never turn a completed upload into a failure.
                pass


def log_progress(source: str, message: str) -> None:
    """Emit a structured, replaceable progress update for the desktop UI."""
    log(f"\x1ePROGRESS\t{source}\t{message}")


def sanitize_file_name(name: str) -> str:
    path = Path(name)
    extension = re.sub(r"[^a-zA-Z0-9]", "", path.suffix.lstrip("."))[:8]
    stem = re.sub(r"[^a-zA-Z0-9._@-]+", "-", path.stem)
    stem = re.sub(r"\.{2,}", ".", stem).strip("-._@")[:120]
    if not stem or not re.match(r"^[a-zA-Z0-9]", stem):
        # Do not use a random fallback: a given original name must always
        # receive the same normalized bucket-name base on every computer/run.
        stem = f"file-{hashlib.sha256(name.encode('utf-8')).hexdigest()[:12]}"
    return f"{stem}.{extension.lower()}" if extension else stem


def storage_key_for_source(relative: str) -> str:
    """Store every selected file directly at the configured bucket root."""
    name = sanitize_file_name(Path(relative).name)
    if not name:
        raise UploadError(f"Invalid source path: {relative}")
    return name


def unique_storage_key(base_key: str, occupied: set[str]) -> tuple[str, int]:
    """Keep root-level names readable without ever overwriting another file.

    ``clip.mp4`` remains unchanged, then normalisation collisions become
    ``clip-1.mp4``, ``clip-2.mp4`` and so on.
    """
    if base_key not in occupied:
        return base_key, 0
    path = Path(base_key)
    index = 1
    while True:
        candidate = f"{path.stem}-{index}{path.suffix}"
        if candidate not in occupied:
            return candidate, index
        index += 1


def folder_identity(folder: Path) -> str:
    resolved = str(folder.resolve())
    return resolved.casefold() if os.name == "nt" else resolved


def trace_identity(profile: str, folder: Path) -> str:
    """Keep resumable file traces separate for every credential profile."""
    return f"{profile.strip() or 'default'}\x00{folder_identity(folder)}"


def new_folder_state(
    folder: Path,
    drive_url: str,
    project_id: str,
    bucket: str,
    profile: str = "default",
) -> dict[str, Any]:
    return {
        "profile": profile.strip() or "default",
        "folder": str(folder),
        "drive_url": drive_url.rstrip("/"),
        "project_id": project_id,
        "bucket": bucket,
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "files": {},
    }


class StateStore:
    def __init__(
        self,
        path: Path,
        folder: Path,
        drive_url: str,
        project_id: str,
        bucket: str,
        profile: str = "default",
    ) -> None:
        self.save_lock = threading.RLock()
        self.path = path
        self.backup_path = path.with_name(f"{path.name}.bak")
        if path.exists() or self.backup_path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                self.data = json.loads(
                    self.backup_path.read_text(encoding="utf-8")
                )
                log(f"Recovered upload state from {self.backup_path}")
            loaded_version = self.data.get("version")
            migrated_from_panel_version = loaded_version == 1
            if loaded_version == 1:
                old_data = self.data
                old_folder = Path(str(old_data.get("folder", folder))).resolve()
                self.root = {
                    "version": STATE_VERSION,
                    "created_at": old_data.get("created_at", utc_now()),
                    "updated_at": utc_now(),
                    "folders": {folder_identity(old_folder): old_data},
                }
            elif loaded_version == STATE_VERSION:
                self.root = self.data
            else:
                raise UploadError(f"Unsupported state version in {path}")
            identity = trace_identity(profile, folder)
            self.data = self.root.setdefault("folders", {}).setdefault(
                identity,
                new_folder_state(folder, drive_url, project_id, bucket, profile),
            )
            recorded_url = str(
                self.data.get("drive_url") or (
                    "" if migrated_from_panel_version
                    else self.data.get("base_url", "")
                )
            ).rstrip("/")
            if recorded_url and recorded_url != drive_url.rstrip("/"):
                raise UploadError(
                    f"{path} tracks {recorded_url}, not {drive_url}."
                )
            for field, actual in (("project_id", project_id), ("bucket", bucket)):
                recorded = str(self.data.get(field, ""))
                if recorded and recorded != actual:
                    raise UploadError(
                        f"{path} tracks {field}={recorded}, not {actual}."
                    )
                self.data[field] = actual
            self.data["drive_url"] = drive_url.rstrip("/")
            self.data["profile"] = profile.strip() or "default"
            self.data.pop("base_url", None)
        else:
            self.data = new_folder_state(
                folder,
                drive_url,
                project_id,
                bucket,
                profile,
            )
            self.root = {
                "version": STATE_VERSION,
                "created_at": utc_now(),
                "updated_at": utc_now(),
                "folders": {trace_identity(profile, folder): self.data},
            }

    def save(self) -> None:
        # Several files can finish parts at once. Serialize snapshots so the
        # durable resume manifest is never written concurrently.
        with self.save_lock:
            self.data["updated_at"] = utc_now()
            self.root["updated_at"] = utc_now()
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_name(f"{self.path.name}.tmp")
            with temporary.open("w", encoding="utf-8", newline="\n") as output:
                json.dump(self.root, output, indent=2, sort_keys=True)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            if self.path.exists():
                shutil.copy2(self.path, self.backup_path)
            os.replace(temporary, self.path)


class StateLock:
    def __init__(self, state_path: Path) -> None:
        self.path = state_path.with_name(f"{state_path.name}.lock")
        self.acquired = False

    def __enter__(self) -> "StateLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor: int | None = None
        for attempt in range(2):
            try:
                descriptor = os.open(
                    self.path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                )
                break
            except FileExistsError as error:
                try:
                    details = self.path.read_text(encoding="utf-8").strip()
                    match = re.search(r"PID\s+(\d+)", details)
                    pid = int(match.group(1)) if match else None
                    if attempt == 0 and pid and not process_is_running(pid):
                        self.path.unlink()
                        log(f"Removed stale uploader lock for PID {pid}")
                        continue
                except OSError:
                    details = "another uploader process"
                raise UploadError(
                    f"Uploader state is already locked by {details}. "
                    f"If no uploader is running, remove {self.path}."
                ) from error
        if descriptor is None:
            raise UploadError(f"Unable to acquire uploader lock {self.path}")
        with os.fdopen(descriptor, "w", encoding="utf-8") as lock_file:
            lock_file.write(f"PID {os.getpid()} since {utc_now()}\n")
            lock_file.flush()
            os.fsync(lock_file.fileno())
        self.acquired = True
        return self

    def __exit__(self, *_args: object) -> None:
        if self.acquired:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass


def process_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


class DriveClient:
    def __init__(
        self,
        drive_url: str,
        api_key: str,
        project_id: str,
        bucket: str,
        timeout: int,
    ) -> None:
        parsed = urllib.parse.urlsplit(drive_url.strip())
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise UploadError("Drive URL must be a full http:// or https:// URL")
        self.endpoint = urllib.parse.urlunsplit((
            parsed.scheme,
            parsed.netloc,
            "/api/v1/storage/multipart",
            "",
            "",
        ))
        self.api_key = api_key.strip()
        self.project_id = project_id.strip()
        self.bucket = bucket.strip()
        self.timeout = timeout

    def multipart(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "drive-folder-uploader/3",
            "Authorization": f"Bearer {self.api_key}",
            "X-Drive-Project": self.project_id,
            "X-Drive-Bucket": self.bucket,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise UploadError(
                f"Drive API multipart {payload.get('action', 'request')} "
                f"returned HTTP {error.code}: {body or error.reason}"
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise UploadError(f"Unable to reach Drive API: {error}") from error
        try:
            data = json.loads(body or "{}")
        except json.JSONDecodeError as error:
            raise UploadError(f"Drive API returned invalid JSON: {body[:300]}") from error
        if data.get("error"):
            raise UploadError(str(data["error"]))
        return data

    def object_size(self, key: str) -> int | None:
        encoded_key = "/".join(
            urllib.parse.quote(part, safe="") for part in key.split("/")
        )
        endpoint_parts = urllib.parse.urlsplit(self.endpoint)
        url = urllib.parse.urlunsplit((
            endpoint_parts.scheme,
            endpoint_parts.netloc,
            f"/api/v1/storage/object/{encoded_key}",
            "",
            "",
        ))
        request = urllib.request.Request(
            url,
            method="HEAD",
            headers={
                "User-Agent": "drive-folder-uploader/3",
                "Authorization": f"Bearer {self.api_key}",
                "X-Drive-Project": self.project_id,
                "X-Drive-Bucket": self.bucket,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                value = response.headers.get("Content-Length")
                return int(value) if value is not None else None
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise UploadError(
                f"Drive object verification returned HTTP {error.code}"
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise UploadError(f"Unable to verify Drive object: {error}") from error


def put_part(
    client: DriveClient,
    file_path: Path,
    key: str,
    upload_id: str,
    part_number: int,
    start: int,
    length: int,
    retries: int,
) -> tuple[int, str, int]:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            part = client.multipart({
                "action": "part",
                "key": key,
                "uploadId": upload_id,
                "partNumber": part_number,
            })
            url = part.get("url")
            if not url:
                raise UploadError(f"No upload URL returned for part {part_number}")
            with file_path.open("rb") as source:
                source.seek(start)
                payload = source.read(length)
            if len(payload) != length:
                raise UploadError(
                    f"Part {part_number} read {len(payload)} bytes; expected {length}"
                )
            request = urllib.request.Request(
                str(url),
                data=payload,
                method="PUT",
                headers={"Content-Length": str(length)},
            )
            with urllib.request.urlopen(request, timeout=client.timeout) as response:
                response.read()
                etag = response.headers.get("ETag", "").strip()
            if not etag:
                raise UploadError(f"Part {part_number} completed without an ETag")
            return part_number, etag, length
        except Exception as error:
            last_error = error
            if attempt < retries:
                time.sleep(min(2 ** attempt, 8))
    raise UploadError(f"Part {part_number} failed: {last_error}")


def discover_files(
    folder: Path,
    state_path: Path,
    recursive: bool,
) -> list[Path]:
    candidates = folder.rglob("*") if recursive else folder.glob("*")
    excluded = {
        state_path.resolve(),
        state_path.with_name(f"{state_path.name}.tmp").resolve(),
        state_path.with_name(f"{state_path.name}.bak").resolve(),
        state_path.with_name(f"{state_path.name}.lock").resolve(),
    }
    files = [
        path for path in candidates
        if path.is_file()
        and not path.is_symlink()
        and path.resolve() not in excluded
    ]
    # Queue completed source files in chronological order. The relative path
    # makes equal timestamps deterministic across runs and computers.
    return sorted(
        files,
        key=lambda path: (
            path.stat().st_mtime_ns,
            path.relative_to(folder).as_posix().casefold(),
        ),
    )


def source_matches_record(path: Path, record: dict[str, Any]) -> bool:
    stat = path.stat()
    fingerprint = record["fingerprint"]
    return (
        stat.st_size == int(fingerprint["size"])
        and stat.st_mtime_ns == int(fingerprint["mtime_ns"])
    )


def sync_manifest(store: StateStore, folder: Path, files: list[Path]) -> None:
    records: dict[str, dict[str, Any]] = store.data["files"]
    discovered: set[str] = set()
    # `discover_files()` has already created the chronological upload order.
    # Preserve that order here so collision suffixes trace the queued upload.
    for path in files:
        relative = path.relative_to(folder).as_posix()
        discovered.add(relative)
        stat = path.stat()
        fingerprint = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
        record = records.get(relative)
        if record and record.get("fingerprint") == fingerprint:
            record["present"] = True
            continue
        history = list(record.get("history", [])) if record else []
        if record:
            history.append({
                key: record.get(key)
                for key in (
                    "original_file_name",
                    "fingerprint",
                    "key",
                    "key_trace",
                    "status",
                    "uploaded_bytes",
                    "part_count",
                    "completed_part_count",
                    "attempts",
                    "completed_at",
                    "last_error",
                )
            })
            history[-1]["trace"] = list(record.get("trace", []))
        occupied_keys = {
            str(existing.get("key")) for source, existing in records.items()
            # Retain every allocated key, including a source that was removed
            # locally. Its object may still exist in the bucket.
            # If this same source path now has different bytes, its prior key
            # is occupied too: the old object may already be in the bucket.
            if existing.get("key")
        }
        normalized_key = storage_key_for_source(relative)
        storage_key, collision_index = unique_storage_key(
            normalized_key, occupied_keys,
        )
        records[relative] = {
            "source": relative,
            "original_file_name": path.name,
            "fingerprint": fingerprint,
            "content_type": mimetypes.guess_type(path.name)[0]
                or "application/octet-stream",
            # Directly commit to the configured bucket root. The independent
            # Worker discovers and registers this completed object separately.
            "key": storage_key,
            "key_trace": {
                "original_file_name": path.name,
                "normalized_key": normalized_key,
                "allocated_key": storage_key,
                "collision_index": collision_index,
                "collision_resolved": collision_index > 0,
                "collision_strategy": "numeric_suffix",
                "created_at": utc_now(),
            },
            "status": "pending",
            "present": True,
            "attempts": 0,
            "uploaded_bytes": 0,
            "parts": {},
            "history": history,
            "trace": [{
                "event": "discovered",
                "at": utc_now(),
                "original_file_name": path.name,
                "source": relative,
                "normalized_key": normalized_key,
                "key": storage_key,
                "collision_index": collision_index,
            }],
            "created_at": utc_now(),
        }
    for relative, record in records.items():
        if relative not in discovered:
            record["present"] = False
    store.save()


def append_trace(record: dict[str, Any], event: str, **details: Any) -> None:
    record.setdefault("trace", []).append({
        "event": event,
        "at": utc_now(),
        **details,
    })


def upload_file(
    client: DriveClient,
    store: StateStore,
    folder: Path,
    record: dict[str, Any],
    part_size: int,
    part_workers: int,
    part_retries: int,
) -> None:
    path = folder / record["source"]
    if not source_matches_record(path, record):
        raise UploadError("Source file changed; it will be restarted next round")
    size = int(record["fingerprint"]["size"])
    record["attempts"] = int(record.get("attempts", 0)) + 1
    record.update(status="uploading", last_error=None, updated_at=utc_now())
    append_trace(record, "upload_started", attempt=record["attempts"])
    store.save()

    if not record.get("upload_id"):
        started = client.multipart({
            "action": "start",
            "key": record["key"],
            "contentType": record["content_type"],
        })
        upload_id = started.get("uploadId")
        if not upload_id:
            raise UploadError("Multipart start did not return an uploadId")
        record["upload_id"] = upload_id
        append_trace(record, "multipart_started", upload_id=upload_id)
        store.save()

    upload_id = str(record["upload_id"])
    part_count = max(1, (size + part_size - 1) // part_size)
    completed: dict[str, dict[str, Any]] = record.setdefault("parts", {})
    record.update(
        part_size=part_size,
        part_count=part_count,
        completed_part_count=len(completed),
        last_progress_at=utc_now(),
    )
    store.save()
    plans: list[tuple[int, int, int]] = []
    for index in range(part_count):
        part_number = index + 1
        if str(part_number) in completed:
            continue
        start = index * part_size
        plans.append((part_number, start, max(0, min(part_size, size - start))))

    completed_bytes = sum(int(part.get("size", 0)) for part in completed.values())
    last_persist = time.monotonic()
    parts_since_persist = 0
    log_progress(
        record["source"],
        f"Uploading  {0 if size == 0 else completed_bytes * 100 / size:6.2f}%  "
        f"{format_bytes(completed_bytes)} / {format_bytes(size)}",
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, part_workers)) as pool:
        futures = {
            pool.submit(
                put_part,
                client,
                path,
                record["key"],
                upload_id,
                part_number,
                start,
                length,
                part_retries,
            ): part_number
            for part_number, start, length in plans
        }
        failures: list[Exception] = []
        for future in concurrent.futures.as_completed(futures):
            try:
                part_number, etag, length = future.result()
                completed[str(part_number)] = {"etag": etag, "size": length}
                completed_bytes += length
                record.update(
                    uploaded_bytes=min(size, completed_bytes),
                    completed_part_count=len(completed),
                    last_progress_at=utc_now(),
                    updated_at=utc_now(),
                )
                parts_since_persist += 1
                if (
                    parts_since_persist >= max(1, part_workers * 2)
                    or time.monotonic() - last_persist >= 2
                ):
                    store.save()
                    last_persist = time.monotonic()
                    parts_since_persist = 0
                percent = 100 if size == 0 else completed_bytes * 100 / size
                log_progress(
                    record["source"],
                    f"Uploading  {percent:6.2f}%  "
                    f"{format_bytes(completed_bytes)} / {format_bytes(size)}",
                )
            except Exception as error:
                failures.append(error)
    store.save()
    if failures:
            raise UploadError(
                f"{len(failures)} part(s) failed; completed parts were saved. "
                f"First error: {failures[0]}"
            )

    parts = []
    for part_number in range(1, part_count + 1):
        part = completed.get(str(part_number))
        if not part:
            raise UploadError(f"Missing completed part {part_number}")
        parts.append({"partNumber": part_number, "etag": part["etag"]})
    if not source_matches_record(path, record):
        raise UploadError("Source file changed before completion")
    # Only the storage completion response is authoritative. Registration is
    # intentionally left to the independent worker scan.
    completion_payload = {
        "action": "complete",
        "key": record["key"],
        "uploadId": upload_id,
        "parts": parts,
    }
    completion: dict[str, Any] | None = None
    completion_error: UploadError | None = None
    for attempt in range(3):
        try:
            completion = client.multipart(completion_payload)
            break
        except UploadError as error:
            completion_error = error
            if "HTTP 5" not in str(error) or attempt == 2:
                break
            time.sleep(2 ** attempt)
    if completion is None:
        # A storage commit may succeed before the API's audit/response layer
        # fails. Confirm the exact object size before deciding this upload is
        # incomplete; never guess success from a generic 500 alone.
        verified_size = client.object_size(record["key"])
        if verified_size != size:
            raise completion_error or UploadError(
                "Multipart completion returned no response"
            )
        completion = {
            "ok": True,
            "action": "complete",
            "key": record["key"],
            "verifiedSize": verified_size,
            "recoveredFromAmbiguousResponse": True,
        }
        append_trace(
            record,
            "storage_completion_verified_after_error",
            error=str(completion_error) if completion_error else None,
            size=verified_size,
        )
    record.update(
        status="uploaded",
        uploaded_bytes=size,
        completed_part_count=part_count,
        completed_at=utc_now(),
        updated_at=utc_now(),
        status_message="Uploaded; awaiting worker scan",
        storage_confirmation=completion,
        last_error=None,
    )
    append_trace(
        record,
        "storage_completed",
        upload_id=upload_id,
        size=size,
        parts=part_count,
        key=record["key"],
        worker_status="awaiting_worker_scan",
    )
    store.save()
    log_progress(record["source"], f"Complete   100.00%  {format_bytes(size)}")


def load_gui_settings() -> dict[str, Any]:
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_gui_settings(settings: dict[str, Any]) -> None:
    temporary = SETTINGS_PATH.with_name(f"{SETTINGS_PATH.name}.tmp")
    temporary.write_text(
        json.dumps(settings, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, SETTINGS_PATH)


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def protect_api_key(value: str) -> str:
    if os.name != "nt":
        return "plain:" + base64.b64encode(value.encode("utf-8")).decode("ascii")
    raw = value.encode("utf-8")
    source_buffer = ctypes.create_string_buffer(raw)
    source = DataBlob(
        len(raw),
        ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    protected = DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(source),
        "Media Panel Drive Uploader",
        None,
        None,
        None,
        0,
        ctypes.byref(protected),
    ):
        raise UploadError("Windows could not encrypt the Drive API key")
    try:
        encrypted = ctypes.string_at(protected.pbData, protected.cbData)
        return "dpapi:" + base64.b64encode(encrypted).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(protected.pbData)


def unprotect_api_key(value: str) -> str:
    if value.startswith("plain:"):
        return base64.b64decode(value[6:]).decode("utf-8")
    if not value.startswith("dpapi:") or os.name != "nt":
        raise UploadError("This credential cannot be decrypted on this computer")
    raw = base64.b64decode(value[6:])
    source_buffer = ctypes.create_string_buffer(raw)
    source = DataBlob(
        len(raw),
        ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    decrypted = DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, 0, ctypes.byref(decrypted)
    ):
        raise UploadError(
            "Windows could not decrypt this API key for the current user"
        )
    try:
        return ctypes.string_at(decrypted.pbData, decrypted.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(decrypted.pbData)


def load_credential_store() -> dict[str, Any]:
    backup = CREDENTIALS_PATH.with_name(f"{CREDENTIALS_PATH.name}.bak")
    for path in (CREDENTIALS_PATH, backup):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("version") == 1 and isinstance(data.get("profiles"), dict):
                if path == backup:
                    log(f"Recovered credential profiles from {backup}")
                return data
        except (OSError, json.JSONDecodeError, AttributeError):
            continue
    return {"version": 1, "selected": "", "profiles": {}}


def save_credential_store(data: dict[str, Any]) -> None:
    temporary = CREDENTIALS_PATH.with_name(f"{CREDENTIALS_PATH.name}.tmp")
    backup = CREDENTIALS_PATH.with_name(f"{CREDENTIALS_PATH.name}.bak")
    with temporary.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(data, output, indent=2, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    if CREDENTIALS_PATH.exists():
        shutil.copy2(CREDENTIALS_PATH, backup)
    os.replace(temporary, CREDENTIALS_PATH)


def launch_gui() -> int:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
    except ImportError as error:
        log(f"Tkinter is required for the uploader GUI: {error}")
        return 2

    settings = load_gui_settings()
    credential_store = load_credential_store()
    profiles: dict[str, dict[str, str]] = credential_store["profiles"]
    root = tk.Tk()
    self_test = os.getenv("MEDIA_PANEL_UPLOADER_GUI_SELF_TEST") == "1"
    if self_test:
        root.withdraw()
    root.title("Media Panel Upload")
    root.geometry("760x590")
    root.minsize(680, 500)
    palette = {
        "bg": "#09090b", "panel": "#18181b", "input": "#111113",
        "border": "#3f3f46", "text": "#fafafa", "muted": "#a1a1aa",
        "primary": "#fafafa", "primary_text": "#18181b",
    }
    root.configure(background=palette["bg"])
    style = ttk.Style(root)
    # Windows 11's native renderer supplies the rounded focus rings, buttons,
    # spinboxes and menu surfaces that Tk's cross-platform themes cannot.
    if "winnative" in style.theme_names():
        style.theme_use("winnative")
    elif "vista" in style.theme_names():
        style.theme_use("vista")
    style.configure("App.TFrame", background=palette["bg"])
    style.configure("Card.TFrame", background=palette["panel"])
    style.configure("TLabel", background=palette["bg"], foreground=palette["text"], font=("Segoe UI", 10))
    style.configure("Muted.TLabel", background=palette["bg"], foreground=palette["muted"], font=("Segoe UI", 9))
    style.configure("Title.TLabel", background=palette["bg"], foreground=palette["text"], font=("Segoe UI Semibold", 15))
    style.configure("Card.TLabelframe", background=palette["panel"], bordercolor=palette["border"], relief="solid")
    style.configure("Card.TLabelframe.Label", background=palette["panel"], foreground=palette["text"], font=("Segoe UI Semibold", 10))
    style.configure("TEntry", fieldbackground=palette["input"], foreground=palette["text"], insertcolor=palette["text"], bordercolor=palette["border"], padding=8)
    style.configure("TCombobox", fieldbackground=palette["input"], background=palette["input"], foreground=palette["text"], arrowcolor=palette["muted"], padding=7)
    style.map("TCombobox", fieldbackground=[("readonly", palette["input"])], foreground=[("readonly", palette["text"])])
    style.configure("TButton", background="#27272a", foreground=palette["text"], bordercolor=palette["border"], padding=(9, 5), font=("Segoe UI Semibold", 9))
    style.map("TButton", background=[("active", "#3f3f46")])
    style.configure("Primary.TButton", background=palette["primary"], foreground=palette["primary_text"], bordercolor=palette["primary"])
    style.configure("Danger.TButton", background="#3f161a", foreground="#fecaca", bordercolor="#7f1d1d")
    style.configure("TCheckbutton", background=palette["panel"], foreground=palette["text"], font=("Segoe UI", 9))
    style.configure("TSpinbox", fieldbackground=palette["input"], foreground=palette["text"], arrowcolor=palette["muted"], padding=5)
    style.configure("Upload.Horizontal.TProgressbar", troughcolor="#27272a", background=palette["text"], bordercolor="#27272a")

    profile_name = tk.StringVar(value=str(credential_store.get("selected", "")))
    drive_url = tk.StringVar(value=os.getenv("DRIVE_STORAGE_BASE_URL", ""))
    api_key = tk.StringVar(value=os.getenv("DRIVE_STORAGE_API_KEY", ""))
    project_id = tk.StringVar(
        value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", "")
    )
    bucket = tk.StringVar(value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", ""))
    source_folder = tk.StringVar(value=str(settings.get("source_folder", "")))
    recursive = tk.BooleanVar(value=bool(settings.get("recursive", True)))
    retry_forever = tk.BooleanVar(value=bool(settings.get("retry_forever", True)))
    workers = tk.IntVar(value=int(settings.get("workers", 4)))
    file_workers = tk.IntVar(value=int(settings.get("file_workers", 2)))
    part_size_mb = tk.IntVar(value=int(settings.get("part_size_mb", 8)))
    show_key = tk.BooleanVar()
    status = tk.StringVar(value="Ready")
    events: queue.Queue[tuple[str, object]] = queue.Queue()
    latest_progress: dict[str, str] = {}
    progress_lock = threading.Lock()
    child: subprocess.Popen[str] | None = None

    root.columnconfigure(0, weight=1)
    root.rowconfigure(2, weight=1)
    header = ttk.Frame(root, style="App.TFrame", padding=(18, 14, 18, 8))
    header.grid(row=0, column=0, sticky="ew")
    header.columnconfigure(0, weight=1)
    ttk.Label(header, text="Direct upload", style="Title.TLabel").grid(row=0, column=0, sticky="w")
    ttk.Label(header, text="Worker registration is automatic", style="Muted.TLabel").grid(row=0, column=1, sticky="e")
    form = ttk.LabelFrame(root, text="Upload settings", padding=12, style="Card.TLabelframe")
    form.grid(row=1, column=0, sticky="ew", padx=18, pady=(0, 8))
    form.columnconfigure(1, weight=1)

    def entry(row: int, label: str, variable: tk.StringVar, secret=False):
        ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", pady=5)
        widget = ttk.Entry(form, textvariable=variable, show="•" if secret else "")
        widget.grid(row=row, column=1, sticky="ew", padx=(10, 0), pady=5)
        return widget

    ttk.Label(form, text="Credential profile").grid(
        row=0, column=0, sticky="w", pady=5
    )
    profile_picker = ttk.Combobox(
        form,
        textvariable=profile_name,
        values=sorted(profiles),
    )
    profile_picker.grid(row=0, column=1, sticky="ew", padx=(10, 0), pady=5)
    profile_actions = ttk.Frame(form)
    profile_actions.grid(row=0, column=2, sticky="e", padx=(8, 0), pady=5)

    entry(1, "Drive storage URL", drive_url)
    key_entry = entry(2, "Drive API key", api_key, True)
    entry(3, "Drive project ID", project_id)
    entry(4, "Drive bucket", bucket)
    source_entry = entry(5, "Source folder", source_folder)

    def choose_folder() -> None:
        selected = filedialog.askdirectory(
            title="Select folder to upload",
            initialdir=source_folder.get() or None,
            mustexist=True,
        )
        if selected:
            source_folder.set(selected)

    ttk.Button(form, text="Choose folder", command=choose_folder).grid(
        row=5, column=2, padx=(8, 0), pady=5
    )
    ttk.Checkbutton(
        form,
        text="Show API key",
        variable=show_key,
        command=lambda: key_entry.configure(show="" if show_key.get() else "•"),
    ).grid(row=6, column=1, sticky="w")
    options = ttk.Frame(form)
    options.grid(row=7, column=0, columnspan=3, sticky="ew", pady=(8, 0))
    ttk.Checkbutton(
        options, text="Include subfolders", variable=recursive,
    ).pack(side="left", padx=(0, 18))
    ttk.Checkbutton(
        options, text="Retry until all complete", variable=retry_forever,
    ).pack(side="left", padx=(0, 18))
    ttk.Label(options, text="Parallel parts").pack(side="left")
    ttk.Spinbox(
        options, from_=1, to=16, width=4, textvariable=workers,
    ).pack(side="left", padx=(6, 0))
    ttk.Label(options, text="Part size (MB)").pack(side="left", padx=(18, 0))
    ttk.Spinbox(
        options, from_=5, to=512, width=5, textvariable=part_size_mb,
    ).pack(side="left", padx=(6, 0))
    ttk.Label(options, text="Concurrent files").pack(side="left", padx=(18, 0))
    ttk.Spinbox(
        options, from_=1, to=8, width=4, textvariable=file_workers,
    ).pack(side="left", padx=(6, 0))

    def load_profile(_event: object = None) -> None:
        name = profile_name.get().strip()
        profile = profiles.get(name)
        if not profile:
            return
        try:
            secret = unprotect_api_key(str(profile.get("api_key", "")))
        except (UploadError, ValueError) as error:
            messagebox.showerror("Unable to load profile", str(error))
            return
        drive_url.set(str(profile.get("drive_url", "")))
        api_key.set(secret)
        project_id.set(str(profile.get("project_id", "")))
        bucket.set(str(profile.get("bucket", "")))
        credential_store["selected"] = name
        save_credential_store(credential_store)
        status.set(f"Loaded credential profile: {name}")

    def save_profile(notify=True) -> bool:
        name = profile_name.get().strip()
        if not name:
            messagebox.showerror("Profile name required", "Enter a credential profile name.")
            return False
        values = (
            drive_url.get().strip().rstrip("/"),
            api_key.get().strip(),
            project_id.get().strip(),
            bucket.get().strip(),
        )
        if not all(values):
            messagebox.showerror(
                "Incomplete profile",
                "Enter the Drive URL, API key, project ID, and bucket.",
            )
            return False
        url, secret, project, bucket_name = values
        try:
            encrypted_key = protect_api_key(secret)
        except UploadError as error:
            messagebox.showerror("Unable to save profile", str(error))
            return False
        profiles[name] = {
            "drive_url": url,
            "api_key": encrypted_key,
            "project_id": project,
            "bucket": bucket_name,
            "updated_at": utc_now(),
        }
        credential_store["selected"] = name
        save_credential_store(credential_store)
        profile_picker.configure(values=sorted(profiles))
        status.set(f"Saved credential profile: {name}")
        if notify:
            messagebox.showinfo("Profile saved", f"Saved credentials for {name}.")
        return True

    def new_profile() -> None:
        profile_name.set("")
        drive_url.set("")
        api_key.set("")
        project_id.set("")
        bucket.set("")
        profile_picker.focus_set()
        status.set("Enter a name and settings for the new profile")

    def delete_profile() -> None:
        name = profile_name.get().strip()
        if name not in profiles:
            return
        if not messagebox.askyesno(
            "Delete credential profile",
            f"Delete the saved credentials for {name}?",
        ):
            return
        del profiles[name]
        credential_store["selected"] = ""
        save_credential_store(credential_store)
        profile_picker.configure(values=sorted(profiles))
        new_profile()
        status.set(f"Deleted credential profile: {name}")

    ttk.Button(profile_actions, text="New", command=new_profile).pack(side="left")
    ttk.Button(profile_actions, text="Save", command=save_profile).pack(
        side="left", padx=(5, 0)
    )
    ttk.Button(profile_actions, text="Delete", command=delete_profile).pack(
        side="left", padx=(5, 0)
    )
    profile_picker.bind("<<ComboboxSelected>>", load_profile)
    if profiles:
        if profile_name.get() not in profiles:
            profile_name.set(sorted(profiles)[0])
        load_profile()

    activity = ttk.LabelFrame(root, text="Transfer activity", padding=8, style="Card.TLabelframe")
    activity.grid(row=2, column=0, sticky="nsew", padx=18, pady=(0, 8))
    activity.columnconfigure(0, weight=1)
    activity.rowconfigure(0, weight=1)
    output = tk.Text(activity, wrap="word", state="disabled", font=("Cascadia Mono", 10), background=palette["input"], foreground="#d4d4d8", insertbackground=palette["text"], relief="flat", padx=12, pady=10, highlightthickness=0)
    scroll = ttk.Scrollbar(activity, command=output.yview)
    output.configure(yscrollcommand=scroll.set)
    output.grid(row=0, column=0, sticky="nsew")
    scroll.grid(row=0, column=1, sticky="ns")

    controls = ttk.Frame(root, style="App.TFrame", padding=(18, 2, 18, 14))
    controls.grid(row=3, column=0, sticky="ew")
    controls.columnconfigure(1, weight=1)
    progress = ttk.Progressbar(controls, mode="indeterminate", length=180, style="Upload.Horizontal.TProgressbar")
    progress.grid(row=0, column=0, padx=(0, 12))
    ttk.Label(controls, textvariable=status).grid(row=0, column=1, sticky="w")

    progress_lines: dict[str, str] = {}

    def append(text: str) -> None:
        output.configure(state="normal")
        output.insert("end", text)
        output.see("end")
        output.configure(state="disabled")

    def update_progress_line(source: str, message: str) -> None:
        progress_lines[source] = message
        output.configure(state="normal")
        output.delete("1.0", "end")
        for file_name, progress_message in progress_lines.items():
            output.insert("end", f"{file_name:<48} {progress_message}\n")
        output.see("end")
        output.configure(state="disabled")

    def validate() -> tuple[str, str, str, str, str] | None:
        values = (
            drive_url.get().strip().rstrip("/"),
            api_key.get().strip(),
            project_id.get().strip(),
            bucket.get().strip(),
            source_folder.get().strip(),
        )
        url, secret, project, bucket_name, folder = values
        if not url.startswith(("http://", "https://")):
            messagebox.showerror("Invalid Drive URL", "Enter a full http:// or https:// URL.")
            return None
        if not secret or not project or not bucket_name:
            messagebox.showerror(
                "Missing Drive settings",
                "Enter the Drive API key, project ID, and bucket.",
            )
            return None
        if not folder or not Path(folder).expanduser().is_dir():
            messagebox.showerror("Invalid source", "Select an existing source folder.")
            return None
        return values

    def read_output(process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        for line in iter(process.stdout.readline, ""):
            events.put(("log", line))
        events.put(("finished", process.wait()))

    def start() -> None:
        nonlocal child
        if child and child.poll() is None:
            return
        values = validate()
        if not values:
            return
        url, secret, project, bucket_name, folder = values
        if not profile_name.get().strip():
            profile_name.set(project or "Default")
        if not save_profile(notify=False):
            return
        worker_count = max(1, min(16, workers.get()))
        file_worker_count = max(1, min(8, file_workers.get()))
        part_size = max(5, min(512, part_size_mb.get()))
        save_gui_settings({
            "source_folder": folder,
            "recursive": recursive.get(),
            "retry_forever": retry_forever.get(),
            "workers": worker_count,
            "file_workers": file_worker_count,
            "part_size_mb": part_size,
        })
        command = [
            sys.executable, "-u", str(Path(__file__).resolve()), folder,
            "--drive-url", url,
            "--project-id", project,
            "--bucket", bucket_name,
            "--profile", profile_name.get().strip() or project,
            "--part-workers", str(worker_count),
            "--part-size-mb", str(part_size),
            "--file-workers", str(file_worker_count),
            "--max-rounds", "0" if retry_forever.get() else "5",
        ]
        if recursive.get():
            command.append("--recursive")
        environment = os.environ.copy()
        environment["DRIVE_STORAGE_API_KEY"] = secret
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        try:
            child = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=environment,
                creationflags=flags,
            )
        except OSError as error:
            messagebox.showerror("Unable to start uploader", str(error))
            child = None
            return
        append("\n=== Direct Drive upload started ===\n")
        status.set("Uploading…")
        progress.start(12)
        start_button.configure(state="disabled")
        stop_button.configure(state="normal")
        threading.Thread(target=read_output, args=(child,), daemon=True).start()

    def stop() -> None:
        if child and child.poll() is None:
            status.set("Stopping…")
            child.terminate()

    start_button = ttk.Button(controls, text="Start upload", command=start, style="Primary.TButton")
    start_button.grid(row=0, column=2, padx=(8, 6))
    stop_button = ttk.Button(controls, text="Stop", command=stop, state="disabled", style="Danger.TButton")
    stop_button.grid(row=0, column=3)

    def poll() -> None:
        nonlocal child
        try:
            while True:
                event, value = events.get_nowait()
                if event == "log":
                    line = str(value)
                    if line.startswith("\x1ePROGRESS\t"):
                        _, source, progress_message = line.rstrip("\r\n").split(
                            "\t", 2,
                        )
                        update_progress_line(source, progress_message)
                    else:
                        append(line)
                else:
                    code = int(value)
                    progress.stop()
                    start_button.configure(state="normal")
                    stop_button.configure(state="disabled")
                    status.set(
                        "All files uploaded; awaiting worker scan"
                        if code == 0 else f"Stopped with code {code}"
                    )
                    child = None
        except queue.Empty:
            pass
        root.after(100, poll)

    def close() -> None:
        if child and child.poll() is None:
            if not messagebox.askyesno(
                "Upload active",
                "Stop uploading and close? Completed parts are already saved.",
            ):
                return
            child.terminate()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", close)
    root.after(100, poll)
    if self_test:
        root.update_idletasks()
        root.destroy()
        return 0
    root.mainloop()
    return 0


def launch_compact_gui() -> int:
    """Compact native utility UI; upload mechanics remain in this script."""
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
    except ImportError as error:
        log(f"Tkinter is required for the uploader GUI: {error}")
        return 2

    settings = load_gui_settings()
    credential_store = load_credential_store()
    profiles: dict[str, dict[str, str]] = credential_store["profiles"]
    root = tk.Tk()
    self_test = os.getenv("MEDIA_PANEL_UPLOADER_GUI_SELF_TEST") == "1"
    if self_test:
        root.withdraw()
    root.title("Media Panel Upload")
    root.geometry("720x560")
    root.minsize(640, 480)

    style = ttk.Style(root)
    style.theme_use("clam")
    win11 = {"bg": "#f3f3f3", "surface": "#fbfbfb", "border": "#dedede", "text": "#1b1b1b", "muted": "#616161", "blue": "#0067c0"}
    root.configure(background=win11["bg"])
    style.configure("TFrame", background=win11["bg"])
    style.configure("TLabel", background=win11["bg"], foreground=win11["text"], font=("Segoe UI", 9))
    style.configure("TLabelframe", background=win11["surface"], bordercolor=win11["border"], relief="flat", borderwidth=0)
    style.configure("TLabelframe.Label", background=win11["surface"], foreground=win11["text"], font=("Segoe UI Semibold", 9))
    style.configure("TButton", padding=(10, 5), font=("Segoe UI", 9))
    style.configure("Accent.TButton", font=("Segoe UI Semibold", 9))
    style.configure("TEntry", padding=5)
    style.configure("TCombobox", padding=4)
    style.configure("TCheckbutton", background=win11["surface"], foreground=win11["text"], font=("Segoe UI", 9))
    style.configure("Treeview", rowheight=28, font=("Segoe UI", 9))
    style.configure("Treeview.Heading", font=("Segoe UI Semibold", 9), relief="flat")
    style.configure("Horizontal.TProgressbar", troughcolor="#e6e6e6", background=win11["blue"], bordercolor="#e6e6e6")

    profile_name = tk.StringVar(value=str(credential_store.get("selected", "")))
    drive_url = tk.StringVar(value=os.getenv("DRIVE_STORAGE_BASE_URL", ""))
    api_key = tk.StringVar(value=os.getenv("DRIVE_STORAGE_API_KEY", ""))
    project_id = tk.StringVar(value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", ""))
    bucket = tk.StringVar(value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", ""))
    source_folder = tk.StringVar(value=str(settings.get("source_folder", "")))
    recursive = tk.BooleanVar(value=bool(settings.get("recursive", True)))
    retry_forever = tk.BooleanVar(value=bool(settings.get("retry_forever", True)))
    part_workers = tk.IntVar(value=int(settings.get("workers", 4)))
    file_workers = tk.IntVar(value=int(settings.get("file_workers", 2)))
    part_size = tk.IntVar(value=int(settings.get("part_size_mb", 8)))
    status = tk.StringVar(value="Ready")
    events: queue.Queue[tuple[str, object]] = queue.Queue()
    child: subprocess.Popen[str] | None = None
    rows: dict[str, str] = {}

    root.columnconfigure(0, weight=1)
    root.rowconfigure(2, weight=1)
    title = ttk.Frame(root, padding=(18, 15, 18, 9))
    title.grid(row=0, column=0, sticky="ew")
    title.columnconfigure(0, weight=1)
    ttk.Label(title, text="Media Panel Upload", font=("Segoe UI Semibold", 15)).grid(row=0, column=0, sticky="w")
    ttk.Label(title, textvariable=status).grid(row=0, column=1, sticky="e")

    setup = ttk.LabelFrame(root, text="Upload", padding=11)
    setup.grid(row=1, column=0, sticky="ew", padx=18, pady=(0, 9))
    setup.columnconfigure(1, weight=1)
    setup.columnconfigure(2, minsize=132)

    def field(row: int, label: str, variable: tk.StringVar, secret=False):
        ttk.Label(setup, text=label).grid(row=row, column=0, sticky="w", pady=4)
        widget = ttk.Entry(setup, textvariable=variable, show="•" if secret else "")
        widget.grid(row=row, column=1, columnspan=2, sticky="ew", padx=(10, 0), pady=4)
        return widget

    ttk.Label(setup, text="Profile").grid(row=0, column=0, sticky="w", pady=3)
    picker = ttk.Combobox(setup, textvariable=profile_name, values=sorted(profiles), state="normal")
    picker.grid(row=0, column=1, sticky="ew", padx=(8, 0), pady=3)
    profile_buttons = ttk.Frame(setup)
    profile_buttons.grid(row=0, column=2, sticky="e", padx=(8, 0))
    field(1, "Storage URL", drive_url)
    field(2, "API key", api_key, True)
    field(3, "Project ID", project_id)
    field(4, "Bucket", bucket)
    field(5, "Source folder", source_folder)

    def choose_folder():
        selected = filedialog.askdirectory(initialdir=source_folder.get() or None)
        if selected: source_folder.set(selected)
    ttk.Button(setup, text="Browse", command=choose_folder).grid(
        row=5, column=2, sticky="e", padx=(8, 0), pady=4,
    )
    divider = ttk.Separator(setup, orient="horizontal")
    divider.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(8, 8))
    options = ttk.Frame(setup)
    options.grid(row=7, column=0, columnspan=3, sticky="ew")
    options.columnconfigure(1, weight=1)
    ttk.Checkbutton(options, text="Include subfolders", variable=recursive).grid(
        row=0, column=0, sticky="w",
    )
    ttk.Checkbutton(options, text="Retry until complete", variable=retry_forever).grid(
        row=0, column=1, sticky="w", padx=(14, 0),
    )
    tuning = ttk.Frame(options)
    tuning.grid(row=0, column=2, sticky="e")
    for index, (label, variable, minimum, maximum) in enumerate((
        ("Files", file_workers, 1, 8),
        ("Parts", part_workers, 1, 16),
        ("Part size", part_size, 5, 512),
    )):
        column = index * 2
        ttk.Label(tuning, text=label).grid(row=0, column=column, sticky="e", padx=(12 if index else 0, 4))
        ttk.Spinbox(tuning, from_=minimum, to=maximum, width=5, textvariable=variable).grid(
            row=0, column=column + 1, sticky="e",
        )
    ttk.Label(tuning, text="MB").grid(row=0, column=6, sticky="w", padx=(4, 0))

    def load_profile(_event=None):
        profile = profiles.get(profile_name.get().strip())
        if not profile: return
        try: api_key.set(unprotect_api_key(str(profile["api_key"])))
        except (UploadError, ValueError): return
        drive_url.set(str(profile.get("drive_url", ""))); project_id.set(str(profile.get("project_id", ""))); bucket.set(str(profile.get("bucket", "")))

    def save_profile():
        name = profile_name.get().strip()
        if not name or not all((drive_url.get().strip(), api_key.get().strip(), project_id.get().strip(), bucket.get().strip())):
            messagebox.showerror("Profile", "Enter a name and all connection fields."); return False
        profiles[name] = {"drive_url": drive_url.get().strip().rstrip("/"), "api_key": protect_api_key(api_key.get().strip()), "project_id": project_id.get().strip(), "bucket": bucket.get().strip(), "updated_at": utc_now()}
        credential_store["selected"] = name; save_credential_store(credential_store); picker.configure(values=sorted(profiles)); status.set(f"Saved profile: {name}"); return True

    def new_profile():
        profile_name.set(""); drive_url.set(""); api_key.set(""); project_id.set(""); bucket.set(""); picker.focus_set()
    ttk.Button(profile_buttons, text="New", command=new_profile).pack(side="left")
    ttk.Button(profile_buttons, text="Save", command=save_profile).pack(side="left", padx=(4, 0))
    picker.bind("<<ComboboxSelected>>", load_profile)
    if profiles and profile_name.get() in profiles: load_profile()

    activity = ttk.LabelFrame(root, text="Transfers", padding=7)
    activity.grid(row=2, column=0, sticky="nsew", padx=18, pady=(0, 9))
    activity.columnconfigure(0, weight=1); activity.rowconfigure(0, weight=1)
    table = ttk.Treeview(activity, columns=("file", "status"), show="headings", selectmode="none")
    table.heading("file", text="File"); table.heading("status", text="Status")
    table.column("file", width=390, anchor="w"); table.column("status", width=250, anchor="e")
    scrollbar = ttk.Scrollbar(activity, orient="vertical", command=table.yview); table.configure(yscrollcommand=scrollbar.set)
    table.grid(row=0, column=0, sticky="nsew"); scrollbar.grid(row=0, column=1, sticky="ns")

    footer = ttk.Frame(root, padding=(18, 4, 18, 14)); footer.grid(row=3, column=0, sticky="ew")
    footer.columnconfigure(0, weight=1)
    footer.columnconfigure(1, weight=1)
    overall_progress = tk.DoubleVar(value=0)
    overall_detail = tk.StringVar(value="Ready to upload")
    overall_counts = tk.StringVar(value="0 files")
    ttk.Progressbar(
        footer, maximum=100, variable=overall_progress,
    ).grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 5))
    ttk.Label(footer, textvariable=overall_detail).grid(row=1, column=0, sticky="w")
    ttk.Label(footer, textvariable=overall_counts).grid(row=1, column=1, sticky="e")

    def update_row(source: str, text: str):
        item = rows.get(source)
        if item: table.item(item, values=(source, text))
        else: rows[source] = table.insert("", "end", values=(source, text))

    def update_overall_progress():
        percentages = []
        complete = 0
        for item in rows.values():
            values = table.item(item, "values")
            message = values[1] if len(values) > 1 else ""
            match = re.search(r"(\d+(?:\.\d+)?)%", message)
            if match:
                percentage = float(match.group(1))
                percentages.append(percentage)
                if percentage >= 100: complete += 1
        total = len(rows)
        overall_progress.set(sum(percentages) / total if total else 0)
        overall_counts.set(f"{complete} / {total} complete" if total else "0 files")
        if total:
            overall_detail.set("Uploading files to bucket")

    def read_output(process):
        assert process.stdout is not None
        for raw_line in iter(process.stdout.readline, ""):
            line = raw_line.rstrip()
            if line.startswith("\x1ePROGRESS\t"):
                try:
                    _, source, text = line.split("\t", 2)
                except ValueError:
                    continue
                with progress_lock:
                    latest_progress[source] = text
            else:
                events.put(("log", line))
        events.put(("finished", process.wait()))

    def start():
        nonlocal child
        if child and child.poll() is None: return
        folder = Path(source_folder.get()).expanduser()
        if not folder.is_dir(): messagebox.showerror("Source folder", "Select an existing folder."); return
        if not save_profile(): return
        workers = max(1, min(16, part_workers.get())); files = max(1, min(8, file_workers.get())); size = max(5, min(512, part_size.get()))
        save_gui_settings({"source_folder": str(folder), "recursive": recursive.get(), "retry_forever": retry_forever.get(), "workers": workers, "file_workers": files, "part_size_mb": size})
        command = [sys.executable, "-u", str(Path(__file__).resolve()), str(folder), "--drive-url", drive_url.get().strip(), "--project-id", project_id.get().strip(), "--bucket", bucket.get().strip(), "--profile", profile_name.get().strip(), "--part-workers", str(workers), "--file-workers", str(files), "--part-size-mb", str(size), "--max-rounds", "0" if retry_forever.get() else "5"]
        if recursive.get(): command.append("--recursive")
        environment = os.environ.copy(); environment["DRIVE_STORAGE_API_KEY"] = api_key.get().strip()
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=environment, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        rows.clear(); table.delete(*table.get_children()); overall_progress.set(0); overall_counts.set("Preparing files"); overall_detail.set("Starting upload")
        status.set("Uploading"); start_button.configure(state="disabled"); stop_button.configure(state="normal"); threading.Thread(target=read_output, args=(child,), daemon=True).start()

    def stop():
        if child and child.poll() is None: child.terminate(); status.set("Stopping")
    button_box = ttk.Frame(footer); button_box.grid(row=0, column=2, rowspan=2, padx=(12, 0))
    start_button = ttk.Button(button_box, text="Start upload", command=start, style="Accent.TButton"); start_button.pack(side="left", padx=(0, 4))
    stop_button = ttk.Button(button_box, text="Stop", command=stop, state="disabled"); stop_button.pack(side="left")

    def poll():
        nonlocal child
        try:
            while True:
                event, value = events.get_nowait()
                if event == "log":
                    line = str(value).rstrip()
                    if line.startswith("\x1ePROGRESS\t"):
                        _, source, text = line.split("\t", 2); update_row(source, text); update_overall_progress()
                    elif line.startswith("ERROR  "):
                        update_row(line[7:].split(":", 1)[0], "Error")
                else:
                    success = int(value) == 0
                    status.set("All uploaded; awaiting worker scan" if success else f"Stopped ({value})")
                    overall_progress.set(100 if success else overall_progress.get())
                    overall_detail.set("Completed; awaiting worker scan" if success else "Upload stopped")
                    start_button.configure(state="normal"); stop_button.configure(state="disabled"); child = None
        except queue.Empty: pass
        root.after(100, poll)
    root.after(100, poll)
    if self_test: root.update_idletasks(); root.destroy(); return 0
    root.mainloop(); return 0


def launch_modern_gui() -> int:
    """Drive Uploader desktop utility powered by CustomTkinter."""
    try:
        import customtkinter as ctk
        from tkinter import filedialog, messagebox, ttk
    except ImportError as error:
        log(f"CustomTkinter is required for the uploader GUI: {error}")
        return 2

    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    settings = load_gui_settings()
    credential_store = load_credential_store()
    profiles: dict[str, dict[str, str]] = credential_store["profiles"]
    root = ctk.CTk()
    self_test = os.getenv("MEDIA_PANEL_UPLOADER_GUI_SELF_TEST") == "1"
    if self_test: root.withdraw()
    root.title("Drive Uploader")
    root.geometry("780x620")
    root.minsize(660, 520)
    root.configure(fg_color="#111111")
    root.grid_columnconfigure(0, weight=1)
    root.grid_rowconfigure(2, weight=1)

    font_title = ctk.CTkFont(
        family="Segoe UI Variable Display", size=21, weight="bold",
    )
    font_body = ctk.CTkFont(family="Segoe UI Variable Text", size=12)
    font_small = ctk.CTkFont(family="Segoe UI Variable Text", size=11)
    profile_name = ctk.StringVar(value=str(credential_store.get("selected", "")))
    drive_url = ctk.StringVar(value=os.getenv("DRIVE_STORAGE_BASE_URL", ""))
    api_key = ctk.StringVar(value=os.getenv("DRIVE_STORAGE_API_KEY", ""))
    project_id = ctk.StringVar(value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", ""))
    bucket = ctk.StringVar(value=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", ""))
    source_folder = ctk.StringVar(value=str(settings.get("source_folder", "")))
    recursive = ctk.BooleanVar(value=bool(settings.get("recursive", True)))
    retry_forever = ctk.BooleanVar(value=bool(settings.get("retry_forever", True)))
    part_workers = ctk.IntVar(value=int(settings.get("workers", 8)))
    file_workers = ctk.IntVar(value=int(settings.get("file_workers", 4)))
    part_size = ctk.IntVar(value=int(settings.get("part_size_mb", 16)))
    maximum_speed = ctk.BooleanVar(value=bool(settings.get("maximum_speed", True)))
    status = ctk.StringVar(value="Ready")
    overall = ctk.DoubleVar(value=0)
    events: queue.Queue[tuple[str, object]] = queue.Queue()
    latest_progress: dict[str, str] = {}
    progress_lock = threading.Lock()
    child: subprocess.Popen[str] | None = None
    rows: dict[str, str] = {}
    progress_values: dict[str, float] = {}
    total_files = 0

    header = ctk.CTkFrame(root, fg_color="transparent")
    header.grid(row=0, column=0, sticky="ew", padx=22, pady=(15, 10)); header.grid_columnconfigure(0, weight=1)
    title_stack = ctk.CTkFrame(header, fg_color="transparent")
    title_stack.grid(row=0, column=0, sticky="w")
    ctk.CTkLabel(title_stack, text="Drive Uploader", font=font_title, text_color="#fafafa").grid(row=0, column=0, sticky="w")
    ctk.CTkLabel(
        title_stack,
        text="Direct, resumable uploads to Drive storage",
        font=font_small,
        text_color="#8f8f8f",
    ).grid(row=1, column=0, sticky="w", pady=(1, 0))
    status_pill = ctk.CTkFrame(
        header, corner_radius=14, fg_color="#1f1f1f",
        border_width=1, border_color="#333333",
    )
    settings_button = ctk.CTkButton(
        header,
        text="Hide settings",
        width=92,
        height=28,
        corner_radius=7,
        font=font_small,
        fg_color="#252525",
        hover_color="#303030",
        command=lambda: toggle_setup(),
    )
    settings_button.grid(row=0, column=1, sticky="e", padx=(8, 8))
    status_pill.grid(row=0, column=2, sticky="e")
    ctk.CTkLabel(
        status_pill, text="●", font=ctk.CTkFont(size=9),
        text_color="#60a5fa",
    ).pack(side="left", padx=(10, 6), pady=5)
    ctk.CTkLabel(
        status_pill, textvariable=status, font=font_small,
        text_color="#d4d4d4",
    ).pack(side="left", padx=(0, 11), pady=5)

    setup = ctk.CTkFrame(root, corner_radius=12, fg_color="#1b1b1b", border_width=1, border_color="#303030")
    setup.grid(row=1, column=0, sticky="ew", padx=22, pady=(0, 9)); setup.grid_columnconfigure(1, weight=1)
    setup_visible = True

    def toggle_setup(force_hidden: bool | None = None):
        nonlocal setup_visible
        should_show = not setup_visible if force_hidden is None else not force_hidden
        setup_visible = should_show
        if should_show:
            setup.grid()
            settings_button.configure(text="Hide settings")
        else:
            setup.grid_remove()
            settings_button.configure(text="Settings")
    ctk.CTkLabel(setup, text="UPLOAD SETTINGS", font=ctk.CTkFont(family="Segoe UI", size=10, weight="bold"), text_color="#a3a3a3").grid(row=0, column=0, columnspan=3, sticky="w", padx=16, pady=(13, 8))

    def field(row: int, label: str, variable, secret=False):
        ctk.CTkLabel(setup, text=label, font=font_small, text_color="#b0b0b0").grid(row=row, column=0, sticky="w", padx=(16, 10), pady=4)
        entry = ctk.CTkEntry(setup, textvariable=variable, show="•" if secret else "", height=28, corner_radius=7, font=font_small, text_color="#f5f5f5", border_color="#3a3a3a", fg_color="#151515")
        entry.grid(row=row, column=1, columnspan=2, sticky="ew", padx=(0, 16), pady=4)
        return entry

    ctk.CTkLabel(setup, text="Profile", font=font_small, text_color="#b0b0b0").grid(row=1, column=0, sticky="w", padx=(16, 10), pady=4)
    picker = ctk.CTkComboBox(setup, variable=profile_name, values=sorted(profiles) or [""], height=28, corner_radius=7, font=font_small, command=lambda _value: load_profile(), text_color="#f5f5f5", dropdown_text_color="#f5f5f5", dropdown_fg_color="#242424", fg_color="#151515", border_color="#3a3a3a", button_color="#303030")
    picker.grid(row=1, column=1, sticky="ew", pady=4)
    profile_actions = ctk.CTkFrame(setup, fg_color="transparent"); profile_actions.grid(row=1, column=2, sticky="e", padx=(8, 16), pady=4)
    field(2, "Storage URL", drive_url); field(3, "API key", api_key, True); field(4, "Project ID", project_id); field(5, "Bucket", bucket)
    ctk.CTkLabel(setup, text="Source folder", font=font_small, text_color="#b0b0b0").grid(row=6, column=0, sticky="w", padx=(16, 10), pady=4)
    folder_entry = ctk.CTkEntry(setup, textvariable=source_folder, height=28, corner_radius=7, font=font_small, text_color="#f5f5f5", border_color="#3a3a3a", fg_color="#151515")
    folder_entry.grid(row=6, column=1, sticky="ew", pady=4)
    def choose_folder():
        selected = filedialog.askdirectory(initialdir=source_folder.get() or None)
        if selected: source_folder.set(selected)
    ctk.CTkButton(setup, text="Browse", width=76, height=28, corner_radius=7, font=font_small, fg_color="#303030", text_color="#ededed", hover_color="#3a3a3a", command=choose_folder).grid(row=6, column=2, padx=(8, 16), pady=4)

    divider = ctk.CTkFrame(setup, height=1, fg_color="#303030"); divider.grid(row=7, column=0, columnspan=3, sticky="ew", padx=16, pady=(9, 8))
    advanced = ctk.CTkFrame(setup, fg_color="transparent"); advanced.grid(row=8, column=0, columnspan=3, sticky="ew", padx=16, pady=(0, 13)); advanced.grid_columnconfigure(1, weight=1)
    ctk.CTkCheckBox(advanced, text="Include subfolders", variable=recursive, font=font_small, text_color="#dedede", fg_color="#2563eb", hover_color="#1d4ed8", border_color="#555555", checkbox_width=16, checkbox_height=16, corner_radius=4).grid(row=0, column=0, sticky="w")
    ctk.CTkCheckBox(advanced, text="Retry until complete", variable=retry_forever, font=font_small, text_color="#dedede", fg_color="#2563eb", hover_color="#1d4ed8", border_color="#555555", checkbox_width=16, checkbox_height=16, corner_radius=4).grid(row=0, column=1, sticky="w", padx=(16, 0))
    ctk.CTkCheckBox(advanced, text="Maximum speed", variable=maximum_speed, font=font_small, text_color="#dedede", fg_color="#2563eb", hover_color="#1d4ed8", border_color="#555555", checkbox_width=16, checkbox_height=16, corner_radius=4).grid(row=1, column=0, columnspan=2, sticky="w", pady=(8, 0))
    def small_number(parent, text, variable, minimum, maximum, col):
        ctk.CTkLabel(parent, text=text, font=font_small, text_color="#a3a3a3").grid(row=0, column=col, padx=(13, 5))
        ctk.CTkEntry(parent, textvariable=variable, width=46, height=28, corner_radius=5, justify="center", font=font_small, text_color="#f5f5f5", border_color="#3a3a3a", fg_color="#191919").grid(row=0, column=col + 1)
    small_number(advanced, "Files", file_workers, 1, 8, 2); small_number(advanced, "Parts", part_workers, 1, 16, 4); small_number(advanced, "MB", part_size, 5, 512, 6)

    transfers = ctk.CTkFrame(root, corner_radius=12, fg_color="#1b1b1b", border_width=1, border_color="#303030")
    transfers.grid(row=2, column=0, sticky="nsew", padx=22, pady=(0, 9)); transfers.grid_columnconfigure(0, weight=1); transfers.grid_rowconfigure(1, weight=1)
    ctk.CTkLabel(transfers, text="TRANSFERS", font=ctk.CTkFont(family="Segoe UI", size=10, weight="bold"), text_color="#a3a3a3").grid(row=0, column=0, sticky="w", padx=16, pady=(12, 7))
    table_style = ttk.Style(root)
    try:
        table_style.theme_use("clam")
    except Exception:
        pass
    table_style.configure(
        "DriveUploader.Treeview",
        background="#191919",
        fieldbackground="#191919",
        foreground="#ededed",
        rowheight=27,
        borderwidth=0,
        relief="flat",
        bordercolor="#191919",
        lightcolor="#191919",
        darkcolor="#191919",
        font=("Segoe UI", 9),
    )
    table_style.layout(
        "DriveUploader.Treeview",
        [("Treeview.treearea", {"sticky": "nswe"})],
    )
    table_style.configure(
        "DriveUploader.Treeview.Heading",
        background="#242424",
        foreground="#d4d4d4",
        relief="flat",
        borderwidth=0,
        bordercolor="#242424",
        lightcolor="#242424",
        darkcolor="#242424",
        font=("Segoe UI Semibold", 9),
    )
    table_style.map(
        "DriveUploader.Treeview",
        background=[("selected", "#17365f"), ("!selected", "#191919")],
        foreground=[("selected", "#ffffff"), ("!selected", "#ededed")],
    )
    table_style.map(
        "DriveUploader.Treeview.Heading",
        background=[("active", "#2b2b2b"), ("!active", "#242424")],
        foreground=[("active", "#ffffff"), ("!active", "#d4d4d4")],
    )
    transfer_table = ttk.Treeview(
        transfers,
        columns=("file", "status"),
        show="headings",
        selectmode="browse",
        style="DriveUploader.Treeview",
    )
    transfer_table.heading("file", text="File")
    transfer_table.heading("status", text="Status")
    transfer_table.column("file", width=430, minwidth=180, anchor="w")
    transfer_table.column("status", width=250, minwidth=160, anchor="e")
    transfer_scrollbar = ctk.CTkScrollbar(
        transfers,
        command=transfer_table.yview,
    )
    transfer_table.configure(yscrollcommand=transfer_scrollbar.set)
    transfer_table.grid(row=1, column=0, sticky="nsew", padx=(12, 4), pady=(0, 12))
    transfer_scrollbar.grid(row=1, column=1, sticky="ns", padx=(0, 12), pady=(0, 12))

    def scroll_transfers_to(source: str):
        """Keep the file that just changed visible as the queue advances."""
        item = rows.get(source)
        if item:
            transfer_table.see(item)

    footer = ctk.CTkFrame(root, corner_radius=12, fg_color="#1b1b1b", border_width=1, border_color="#303030")
    footer.grid(row=3, column=0, sticky="ew", padx=22, pady=(0, 16)); footer.grid_columnconfigure(0, weight=1)
    ctk.CTkProgressBar(footer, variable=overall, height=5, corner_radius=3, progress_color="#3b82f6", fg_color="#343434").grid(row=0, column=0, columnspan=3, sticky="ew", padx=16, pady=(10, 7))
    detail = ctk.CTkLabel(footer, text="Ready to upload", font=font_small, text_color="#a3a3a3"); detail.grid(row=1, column=0, sticky="w", padx=16, pady=(0, 10))
    start_button = ctk.CTkButton(footer, text="Start upload", width=108, height=30, corner_radius=7, font=font_small, fg_color="#2563eb", hover_color="#1d4ed8", command=lambda: start())
    start_button.grid(row=1, column=1, padx=(8, 6), pady=(0, 10))
    stop_button = ctk.CTkButton(footer, text="Stop", width=64, height=30, corner_radius=7, font=font_small, fg_color="#303030", text_color="#ededed", hover_color="#3a3a3a", state="disabled", command=lambda: stop())
    stop_button.grid(row=1, column=2, padx=(0, 16), pady=(0, 10))

    def load_profile():
        profile = profiles.get(profile_name.get().strip())
        if not profile: return
        try: api_key.set(unprotect_api_key(str(profile["api_key"])))
        except (UploadError, ValueError): return
        drive_url.set(str(profile.get("drive_url", ""))); project_id.set(str(profile.get("project_id", ""))); bucket.set(str(profile.get("bucket", "")))
    def save_profile():
        name = profile_name.get().strip()
        if not name or not all((drive_url.get().strip(), api_key.get().strip(), project_id.get().strip(), bucket.get().strip())):
            messagebox.showerror("Profile", "Enter a profile name and all connection fields."); return False
        profiles[name] = {"drive_url": drive_url.get().strip().rstrip("/"), "api_key": protect_api_key(api_key.get().strip()), "project_id": project_id.get().strip(), "bucket": bucket.get().strip(), "updated_at": utc_now()}
        credential_store["selected"] = name; save_credential_store(credential_store); picker.configure(values=sorted(profiles)); status.set(f"Saved profile: {name}"); return True
    def new_profile():
        profile_name.set(""); drive_url.set(""); api_key.set(""); project_id.set(""); bucket.set(""); picker.focus()
    ctk.CTkButton(profile_actions, text="New", width=48, height=30, corner_radius=5, font=font_small, fg_color="#303030", text_color="#ededed", hover_color="#3a3a3a", command=new_profile).pack(side="left", padx=(0, 4))
    ctk.CTkButton(profile_actions, text="Save", width=48, height=30, corner_radius=5, font=font_small, fg_color="#303030", text_color="#ededed", hover_color="#3a3a3a", command=save_profile).pack(side="left")
    if profiles and profile_name.get() in profiles: load_profile()

    def update_row(source: str, text: str):
        match = re.search(r"(\d+(?:\.\d+)?)%", text)
        if match:
            progress_values[source] = float(match.group(1))
        row = rows.get(source)
        if row:
            transfer_table.item(row, values=(source, text))
        else:
            rows[source] = transfer_table.insert(
                "", "end", values=(source, text),
            )
    def update_overall():
        percentages = list(progress_values.values())
        completed = sum(value >= 100 for value in percentages)
        # Rows appear only when a file starts. Untouched queued files count as
        # zero, so the footer always represents the entire selected folder.
        total = max(total_files, len(rows))
        overall.set(sum(percentages) / total / 100 if total else 0)
        active = sum(0 < value < 100 for value in percentages)
        queued = max(0, total - completed - active)
        detail.configure(
            text=(
                f"{completed} / {total} complete  \u2022  "
                f"{active} uploading  \u2022  {queued} queued"
                if total else "Preparing files"
            ),
        )
    def read_output(process):
        assert process.stdout is not None
        for raw_line in iter(process.stdout.readline, ""):
            line = raw_line.rstrip()
            if line.startswith("\x1ePROGRESS\t"):
                try:
                    _, source, text = line.split("\t", 2)
                except ValueError:
                    continue
                with progress_lock:
                    latest_progress[source] = text
            else:
                events.put(("log", line))
        events.put(("finished", process.wait()))
    def start():
        nonlocal child, total_files
        if child and child.poll() is None: return
        folder = Path(source_folder.get()).expanduser()
        if not folder.is_dir(): messagebox.showerror("Source folder", "Select an existing folder."); return
        if not save_profile(): return
        workers = max(1, min(16, part_workers.get()))
        files = max(1, min(8, file_workers.get()))
        size = max(5, min(512, part_size.get()))
        if maximum_speed.get():
            workers = max(8, workers)
            files = max(4, files)
            size = max(16, size)
        save_gui_settings({"source_folder": str(folder), "recursive": recursive.get(), "retry_forever": retry_forever.get(), "maximum_speed": maximum_speed.get(), "workers": workers, "file_workers": files, "part_size_mb": size})
        command = [sys.executable, "-u", str(Path(__file__).resolve()), str(folder), "--drive-url", drive_url.get().strip(), "--project-id", project_id.get().strip(), "--bucket", bucket.get().strip(), "--profile", profile_name.get().strip(), "--part-workers", str(workers), "--file-workers", str(files), "--part-size-mb", str(size), "--max-rounds", "0" if retry_forever.get() else "5"]
        if recursive.get(): command.append("--recursive")
        environment = os.environ.copy(); environment["DRIVE_STORAGE_API_KEY"] = api_key.get().strip()
        # The child performs the authoritative scan. Keeping it out of the UI
        # callback prevents Windows from marking the window as unresponsive.
        total_files = 0
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=environment, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        transfer_table.delete(*transfer_table.get_children())
        progress_values.clear()
        toggle_setup(force_hidden=True)
        rows.clear(); overall.set(0); detail.configure(text=f"0 / {total_files} complete" if total_files else "Preparing files"); status.set("Uploading"); start_button.configure(state="disabled"); stop_button.configure(state="normal"); threading.Thread(target=read_output, args=(child,), daemon=True).start()
    def stop():
        if child and child.poll() is None: child.terminate(); status.set("Stopping")
    def poll():
        nonlocal child, total_files
        with progress_lock:
            sources = list(latest_progress)[:160]
            progress = {
                source: latest_progress.pop(source) for source in sources
            }
        for source, text in progress.items():
            update_row(source, text)
        if progress:
            update_overall()
            active_sources = [
                source for source, text in progress.items()
                if not text.startswith("Ready")
            ]
            if active_sources:
                scroll_transfers_to(active_sources[-1])
        try:
            for _ in range(50):
                event, value = events.get_nowait()
                if event == "log":
                    line = str(value).rstrip()
                    if line.startswith("ERROR  "):
                        error_text = line[7:]
                        source, _, message = error_text.partition(": ")
                        update_row(source, message or error_text)
                        status.set("Upload error; retrying")
                        detail.configure(text=message or error_text)
                    elif line.startswith("Ready queue:"):
                        match = re.search(r"(\d+) file", line)
                        if match:
                            total_files = int(match.group(1))
                            detail.configure(text=f"0 / {total_files} ready")
                    elif line.startswith("Fatal:"):
                        detail.configure(text=line)
                        status.set("Upload failed")
                else:
                    success = int(value) == 0; status.set("All uploaded; awaiting worker scan" if success else f"Stopped ({value})"); detail.configure(text="Completed; awaiting worker scan" if success else "Upload stopped"); overall.set(1 if success else overall.get()); start_button.configure(state="normal"); stop_button.configure(state="disabled"); child = None
        except queue.Empty:
            pass
        root.after(50, poll)
    root.after(50, poll)
    if self_test: root.update_idletasks(); root.destroy(); return 0
    root.mainloop(); return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload every file in a folder with persistent resume state."
    )
    parser.add_argument("folder", type=Path, nargs="?", help="Folder containing files")
    parser.add_argument("--gui", action="store_true", help="Open the desktop GUI")
    parser.add_argument(
        "--drive-url",
        "--base-url",
        dest="drive_url",
        default=os.getenv("DRIVE_STORAGE_BASE_URL", ""),
        help="Drive storage URL (or DRIVE_STORAGE_BASE_URL)",
    )
    parser.add_argument(
        "--drive-api-key",
        dest="drive_api_key",
        default=os.getenv("DRIVE_STORAGE_API_KEY", ""),
        help="Drive API key (or DRIVE_STORAGE_API_KEY)",
    )
    parser.add_argument(
        "--project-id",
        default=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID", ""),
        help="Drive project ID (or NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID)",
    )
    parser.add_argument(
        "--bucket",
        default=os.getenv("NEXT_PUBLIC_DRIVE_STORAGE_BUCKET", ""),
        help="Drive bucket (or NEXT_PUBLIC_DRIVE_STORAGE_BUCKET)",
    )
    parser.add_argument(
        "--profile",
        default="default",
        help="Credential profile name used to isolate resumable upload traces",
    )
    parser.add_argument("--state", type=Path, help="JSON state file path")
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--part-size-mb", type=int, default=8)
    parser.add_argument("--part-workers", type=int, default=4)
    parser.add_argument(
        "--file-workers",
        type=int,
        default=2,
        help="Number of files to upload concurrently (default: 2)",
    )
    parser.add_argument("--part-retries", type=int, default=3)
    parser.add_argument("--request-timeout", type=int, default=120)
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=5,
        help="Retry rounds for failed files; 0 retries until all finish",
    )
    parser.add_argument("--retry-delay", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.gui or args.folder is None:
        return launch_modern_gui()
    folder = args.folder.expanduser().resolve()
    if not folder.is_dir():
        raise UploadError(f"Folder does not exist: {folder}")
    state_path = (args.state or DEFAULT_STATE_PATH).expanduser().resolve()
    files = discover_files(folder, state_path, args.recursive)
    if args.dry_run:
        log(f"Found {len(files)} file(s) in {folder}")
        for path in files:
            log(f"  {path.relative_to(folder)} ({format_bytes(path.stat().st_size)})")
        return 0
    required = {
        "Drive URL": args.drive_url,
        "Drive API key": args.drive_api_key,
        "Drive project ID": args.project_id,
        "Drive bucket": args.bucket,
    }
    missing = [name for name, value in required.items() if not str(value).strip()]
    if missing:
        raise UploadError(f"Missing required setting(s): {', '.join(missing)}")
    if args.part_size_mb < 5:
        raise UploadError("--part-size-mb must be at least 5")

    with StateLock(state_path):
        return run_uploads(
            args,
            folder,
            state_path,
            files,
        )


def run_uploads(
    args: argparse.Namespace,
    folder: Path,
    state_path: Path,
    files: list[Path],
) -> int:
    store = StateStore(
        state_path,
        folder,
        args.drive_url,
        args.project_id,
        args.bucket,
        args.profile,
    )
    sync_manifest(store, folder, files)
    # Finish all local work before opening upload slots. Every item now has a
    # persistent fingerprint, collision-safe bucket key, and a visible queue
    # state; concurrent workers only perform the network transfer.
    ready_count = 0
    for record in store.data["files"].values():
        if not record.get("present") or record.get("status") == "uploaded":
            continue
        path = folder / str(record["source"])
        try:
            if not source_matches_record(path, record):
                raise UploadError("Source file changed during queue preparation")
            record.update(
                status="ready",
                status_message="Ready to upload",
                last_error=None,
                updated_at=utc_now(),
            )
            append_trace(record, "upload_queued", queue_position=ready_count + 1)
            ready_count += 1
            log_progress(str(record["source"]), "Ready to upload")
        except (OSError, UploadError) as error:
            record.update(
                status="error",
                status_message="Queue preparation failed",
                last_error=str(error),
                updated_at=utc_now(),
            )
            append_trace(record, "queue_preparation_failed", error=str(error))
            log(f"ERROR  {record['source']}: {error}")
    store.save()
    log(f"Ready queue: {ready_count} file(s), oldest source file first")
    client = DriveClient(
        args.drive_url,
        args.drive_api_key,
        args.project_id,
        args.bucket,
        args.request_timeout,
    )
    round_number = 0

    def upload_record(record: dict[str, Any]) -> None:
        try:
            upload_file(
                client, store, folder, record,
                args.part_size_mb * 1024 * 1024,
                args.part_workers, args.part_retries,
            )
        except KeyboardInterrupt:
            record.update(status="interrupted", updated_at=utc_now())
            append_trace(record, "upload_interrupted")
            store.save()
            raise
        except Exception as error:
            error_message = str(error)
            normalized_error = error_message.lower().replace(" ", "")
            if any(marker in normalized_error for marker in (
                "nosuchupload", "invaliduploadid", "uploaddoesnotexist",
                "multipartuploadnotfound",
            )):
                record.pop("upload_id", None)
                record["parts"] = {}
                record["uploaded_bytes"] = 0
            record.update(status="error", last_error=error_message,
                          updated_at=utc_now())
            append_trace(record, "upload_failed", error=error_message)
            store.save()
            log(f"ERROR  {record['source']}: {error}")
    while True:
        round_number += 1
        # Include files added during a long run and restart any file whose
        # bytes changed since its manifest entry was created.
        sync_manifest(
            store,
            folder,
            discover_files(folder, state_path, args.recursive),
        )
        pending = sorted([
            record for record in store.data["files"].values()
            if record.get("present") and record.get("status") != "uploaded"
        ], key=lambda record: (
            int(record.get("fingerprint", {}).get("mtime_ns", 0)),
            str(record.get("source", "")).casefold(),
        ))
        if not pending:
            total = sum(
                1 for record in store.data["files"].values()
                if record.get("present")
            )
            log(f"All {total} file(s) uploaded; awaiting worker scan.")
            return 0
        log(f"Round {round_number}: {len(pending)} file(s) remaining")
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, args.file_workers),
        ) as pool:
            futures = [pool.submit(upload_record, record) for record in pending]
            for future in concurrent.futures.as_completed(futures):
                future.result()
        remaining = [
            record for record in store.data["files"].values()
            if record.get("present") and record.get("status") != "uploaded"
        ]
        if not remaining:
            continue
        if args.max_rounds > 0 and round_number >= args.max_rounds:
            log(
                f"{len(remaining)} file(s) still failed after {round_number} "
                f"round(s). Re-run the same command to resume."
            )
            return 1
        log(f"Retrying unfinished files in {args.retry_delay} seconds...")
        time.sleep(max(1, args.retry_delay))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Interrupted. Completed parts are saved; run again to resume.")
        raise SystemExit(130)
    except (UploadError, OSError, json.JSONDecodeError) as error:
        log(f"Fatal: {error}")
        raise SystemExit(2)
