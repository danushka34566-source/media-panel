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
DEFAULT_STATE_NAME = "upload-data.json"
DEFAULT_STATE_PATH = Path(__file__).resolve().parent / DEFAULT_STATE_NAME
SETTINGS_PATH = Path(__file__).resolve().parent / "uploader-settings.json"
CREDENTIALS_PATH = Path(__file__).resolve().parent / "credentials.json"
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
        print(message, flush=True)


def sanitize_file_name(name: str) -> str:
    path = Path(name)
    extension = re.sub(r"[^a-zA-Z0-9]", "", path.suffix.lstrip("."))[:8]
    stem = re.sub(r"[^a-zA-Z0-9._@-]+", "-", path.stem)
    stem = re.sub(r"\.{2,}", ".", stem).strip("-._@")[:120]
    if not stem or not re.match(r"^[a-zA-Z0-9]", stem):
        stem = uuid.uuid4().hex[:12]
    return f"{stem}.{extension.lower()}" if extension else stem


def folder_identity(folder: Path) -> str:
    resolved = str(folder.resolve())
    return resolved.casefold() if os.name == "nt" else resolved


def new_folder_state(
    folder: Path,
    drive_url: str,
    project_id: str,
    bucket: str,
) -> dict[str, Any]:
    return {
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
    ) -> None:
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
            identity = folder_identity(folder)
            self.data = self.root.setdefault("folders", {}).setdefault(
                identity,
                new_folder_state(folder, drive_url, project_id, bucket),
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
            self.data.pop("base_url", None)
        else:
            self.data = new_folder_state(
                folder,
                drive_url,
                project_id,
                bucket,
            )
            self.root = {
                "version": STATE_VERSION,
                "created_at": utc_now(),
                "updated_at": utc_now(),
                "folders": {folder_identity(folder): self.data},
            }

    def save(self) -> None:
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
            "User-Agent": "media-panel-folder-uploader/2",
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
                f"Drive API returned HTTP {error.code}: {body or error.reason}"
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
    return sorted(
        path for path in candidates
        if path.is_file()
        and not path.is_symlink()
        and path.resolve() not in excluded
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
                    "fingerprint",
                    "key",
                    "status",
                    "uploaded_bytes",
                    "attempts",
                    "completed_at",
                    "last_error",
                )
            })
        upload_token = uuid.uuid4().hex
        records[relative] = {
            "source": relative,
            "fingerprint": fingerprint,
            "content_type": mimetypes.guess_type(path.name)[0]
                or "application/octet-stream",
            "key": f"uploads/{upload_token}/{sanitize_file_name(path.name)}",
            "status": "pending",
            "present": True,
            "attempts": 0,
            "uploaded_bytes": 0,
            "parts": {},
            "history": history,
            "created_at": utc_now(),
        }
    for relative, record in records.items():
        if relative not in discovered:
            record["present"] = False
    store.save()


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
        store.save()

    upload_id = str(record["upload_id"])
    part_count = max(1, (size + part_size - 1) // part_size)
    completed: dict[str, dict[str, Any]] = record.setdefault("parts", {})
    plans: list[tuple[int, int, int]] = []
    for index in range(part_count):
        part_number = index + 1
        if str(part_number) in completed:
            continue
        start = index * part_size
        plans.append((part_number, start, max(0, min(part_size, size - start))))

    completed_bytes = sum(int(part.get("size", 0)) for part in completed.values())
    log(
        f"UPLOAD {record['source']} "
        f"({format_bytes(completed_bytes)}/{format_bytes(size)})"
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
                record["uploaded_bytes"] = min(size, completed_bytes)
                record["updated_at"] = utc_now()
                store.save()
                percent = 100 if size == 0 else completed_bytes * 100 / size
                log(
                    f"  {record['source']}: {percent:6.2f}% "
                    f"({format_bytes(completed_bytes)}/{format_bytes(size)})"
                )
            except Exception as error:
                failures.append(error)
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
    completion = client.multipart({
        "action": "complete",
        "key": record["key"],
        "uploadId": upload_id,
        "parts": parts,
    })
    record.update(
        status="uploaded",
        uploaded_bytes=size,
        completed_at=utc_now(),
        updated_at=utc_now(),
        status_message="Uploaded; awaiting worker scan",
        storage_confirmation=completion,
        last_error=None,
    )
    store.save()
    log(f"DONE   {record['source']} ({format_bytes(size)})")


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
    root.title("Media Panel Direct Drive Uploader")
    root.geometry("860x680")
    root.minsize(720, 560)

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
    show_key = tk.BooleanVar()
    status = tk.StringVar(value="Ready")
    events: queue.Queue[tuple[str, object]] = queue.Queue()
    child: subprocess.Popen[str] | None = None

    root.columnconfigure(0, weight=1)
    root.rowconfigure(1, weight=1)
    form = ttk.LabelFrame(root, text="Direct Drive connection", padding=14)
    form.grid(row=0, column=0, sticky="ew", padx=14, pady=(14, 8))
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

    ttk.Button(form, text="Browse…", command=choose_folder).grid(
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

    activity = ttk.LabelFrame(root, text="Upload activity", padding=8)
    activity.grid(row=1, column=0, sticky="nsew", padx=14, pady=8)
    activity.columnconfigure(0, weight=1)
    activity.rowconfigure(0, weight=1)
    output = tk.Text(activity, wrap="word", state="disabled", font=("Consolas", 10))
    scroll = ttk.Scrollbar(activity, command=output.yview)
    output.configure(yscrollcommand=scroll.set)
    output.grid(row=0, column=0, sticky="nsew")
    scroll.grid(row=0, column=1, sticky="ns")

    controls = ttk.Frame(root, padding=(14, 4, 14, 14))
    controls.grid(row=2, column=0, sticky="ew")
    controls.columnconfigure(1, weight=1)
    progress = ttk.Progressbar(controls, mode="indeterminate", length=150)
    progress.grid(row=0, column=0, padx=(0, 12))
    ttk.Label(controls, textvariable=status).grid(row=0, column=1, sticky="w")

    def append(text: str) -> None:
        output.configure(state="normal")
        output.insert("end", text)
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
        save_gui_settings({
            "source_folder": folder,
            "recursive": recursive.get(),
            "retry_forever": retry_forever.get(),
            "workers": worker_count,
        })
        command = [
            sys.executable, "-u", str(Path(__file__).resolve()), folder,
            "--drive-url", url,
            "--project-id", project,
            "--bucket", bucket_name,
            "--part-workers", str(worker_count),
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

    start_button = ttk.Button(controls, text="Start upload", command=start)
    start_button.grid(row=0, column=2, padx=(8, 6))
    stop_button = ttk.Button(controls, text="Stop", command=stop, state="disabled")
    stop_button.grid(row=0, column=3)

    def poll() -> None:
        nonlocal child
        try:
            while True:
                event, value = events.get_nowait()
                if event == "log":
                    append(str(value))
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
    parser.add_argument("--state", type=Path, help="JSON state file path")
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--part-size-mb", type=int, default=8)
    parser.add_argument("--part-workers", type=int, default=4)
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
        return launch_gui()
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
    )
    sync_manifest(store, folder, files)
    client = DriveClient(
        args.drive_url,
        args.drive_api_key,
        args.project_id,
        args.bucket,
        args.request_timeout,
    )
    round_number = 0
    while True:
        round_number += 1
        # Include files added during a long run and restart any file whose
        # bytes changed since its manifest entry was created.
        sync_manifest(
            store,
            folder,
            discover_files(folder, state_path, args.recursive),
        )
        pending = [
            record for record in store.data["files"].values()
            if record.get("present") and record.get("status") != "uploaded"
        ]
        if not pending:
            total = sum(
                1 for record in store.data["files"].values()
                if record.get("present")
            )
            log(f"All {total} file(s) uploaded; awaiting worker scan.")
            return 0
        log(f"Round {round_number}: {len(pending)} file(s) remaining")
        for record in pending:
            try:
                upload_file(
                    client,
                    store,
                    folder,
                    record,
                    args.part_size_mb * 1024 * 1024,
                    args.part_workers,
                    args.part_retries,
                )
            except KeyboardInterrupt:
                record.update(status="interrupted", updated_at=utc_now())
                store.save()
                raise
            except Exception as error:
                error_message = str(error)
                normalized_error = error_message.lower().replace(" ", "")
                if any(marker in normalized_error for marker in (
                    "nosuchupload",
                    "invaliduploadid",
                    "uploaddoesnotexist",
                    "multipartuploadnotfound",
                )):
                    # Storage discarded the old multipart session. Retain the
                    # stable destination key but start its parts again.
                    record.pop("upload_id", None)
                    record["parts"] = {}
                    record["uploaded_bytes"] = 0
                record.update(
                    status="error",
                    last_error=error_message,
                    updated_at=utc_now(),
                )
                store.save()
                log(f"ERROR  {record['source']}: {error}")
                continue
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
