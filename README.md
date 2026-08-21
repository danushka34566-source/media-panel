# Media Panel

Media Panel is a private, self-hosted media library for photos and videos. It
combines a Next.js control panel, PostgreSQL metadata, Drive or Cloudflare R2
storage, a Cloudflare Worker registration service, and an optional background
video processor.

It is designed for a real media workflow: upload files directly to storage,
register them safely into the library, then process videos independently. A
failed registration never authorizes source deletion, and the registration
queue is resumable and FIFO.

> This project is based on and substantially evolved from
> [sambecker/exif-photo-blog](https://github.com/sambecker/exif-photo-blog).
> It is not the EXIF Photo Blog project and does not present itself as an EXIF
> photo-library distribution. See the upstream repository for its original
> project, license, and history.

## What it includes

- Authenticated media library with albums, tags, favourites, search, and
  responsive photo/video views
- Direct-to-storage uploads and a resumable Windows folder uploader
- Drive gateway or Cloudflare R2 storage, selected automatically from complete
  configuration
- PostgreSQL metadata using a supplied `POSTGRES_URL` (including Supabase)
- Cloudflare Worker registration queue with file-level status and safe retry
- Independent background video processing, previews, posters, subtitles, and
  HLS delivery support
- Admin configuration, processing visibility, cache controls, and role-based
  access

## Architecture

```text
Browser / folder uploader
          |
          v
Drive gateway or Cloudflare R2  <--- media bytes stay here
          |
          v
Cloudflare Backend Orchestrator ---> PostgreSQL media records
          |
          +--> registration queue --> optional Backend Processor
                                      |
                                      v
                              previews / HLS / subtitles

Next.js Media Panel <------------------- PostgreSQL + storage URLs
```

Upload, registration, and video processing are separate phases. An object that
is visible in storage is only **detected**; it becomes library media only after
the Worker has safely committed both its media record and upload mapping.

## Requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL-compatible database
- One storage provider:
  - Drive gateway, or
  - Cloudflare R2
- Cloudflare account for `workers/backend-orchestrator` when automatic
  registration is required

The optional folder uploader runs on Windows with Python 3.

## Quick start

1. Clone the repository and install dependencies.

   ```bash
   pnpm install
   ```

2. Copy the environment template and fill in your values.

   ```bash
   Copy-Item .env.example .env
   ```

3. Set at least:

   - `NEXT_PUBLIC_DOMAIN`
   - `AUTH_SECRET`
   - `POSTGRES_URL`
   - a complete Drive or R2 configuration
   - `BACKEND_ORCHESTRATOR_BASE_URL`
   - `BACKEND_ORCHESTRATOR_SHARED_SECRET`

4. Start the panel.

   ```bash
   pnpm dev
   ```

5. Open `/setup` to create the first super-admin account, then use `/admin` to
   configure and upload media.

The full documented variable list, including worker and processor defaults, is
in [`.env.example`](.env.example).

## Database

Set one standard PostgreSQL URI:

```env
POSTGRES_URL=postgresql://user:password@host:port/database
```

Supabase is supported with its transaction-pooler URI (port `6543`). The
orchestrator connects directly using that URI; no Hyperdrive binding is
required by this repository.

## Storage

### Drive gateway

Provide all Drive values below. A complete Drive configuration takes priority
over R2.

```env
DRIVE_STORAGE_BASE_URL=https://your-drive-domain.com/storage
DRIVE_STORAGE_API_KEY=...
NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID=...
NEXT_PUBLIC_DRIVE_STORAGE_BUCKET=...
```

### Cloudflare R2

If Drive is not fully configured, Media Panel uses R2.

```env
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID=...
NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET=...
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN=...
```

For browser multipart uploads, configure R2 CORS to allow your panel origin,
`PUT`, and the `ETag` response header.

## Registration Worker

The Cloudflare Worker in
[`workers/backend-orchestrator`](workers/backend-orchestrator) scans storage on
a schedule and registers untracked media in FIFO order. Its default runtime is
intentionally conservative:

```env
REGISTER_BATCH_SIZE=1
MAX_REGISTER_PASSES=1
STALE_REGISTRATION_MINUTES=5
```

That means one safe registration attempt per scheduled scan by default; it is
not a total queue limit. A backlog can contain thousands of files and remains
resumable. Configure live values through the super-admin Configuration screen
when you need more throughput.

Deploy configuration is obtained from the panel using
`MEDIA_PANEL_BASE_URL` and `BACKEND_ORCHESTRATOR_SHARED_SECRET`. See the
worker source in [`workers/backend-orchestrator`](workers/backend-orchestrator)
for its commands and endpoints.

## Video processor

The optional processor in
[`workers/backend-processor`](workers/backend-processor) claims video jobs
from the orchestrator, creates media derivatives, and reports completion. It
uses its own shared secret:

```env
BACKEND_PROCESSOR_SHARED_SECRET=...
```

See [`workers/backend-processor`](workers/backend-processor) for host
requirements and run commands.

## Folder uploader

For large existing folders, use the Windows-friendly resumable uploader:

```bash
pnpm upload:folder
```

It sends bytes directly to the Drive gateway and records multipart progress
locally. Upload completion and library registration are intentionally separate:
the uploader can finish while the Worker queue shows the file as `detected` or
`registering`.

## Development checks

```bash
pnpm lint
pnpm build
```

Worker checks are run from the worker directory:

```bash
cd workers/backend-orchestrator
npm test
npm run build
```

## Security notes

- Never commit `.env`, database URIs, storage keys, or worker secrets.
- Use distinct long random secrets for authentication, orchestrator access,
  and processor access.
- Keep storage write credentials server-side.
- Treat media URLs and storage access policy as part of your privacy model.

## Credits

Media Panel began as a customized foundation from
[EXIF Photo Blog by Sam Becker](https://github.com/sambecker/exif-photo-blog).
The current repository has its own media workflow, deployment model, storage
integration, and worker services. Please review the upstream repository for
the original project's license and attribution details.
