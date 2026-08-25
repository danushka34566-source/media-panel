# Media Panel

### A private home for your photos and videos

Media Panel is a self-hosted media library for people who want their own
collection, their own storage, and a little more control than a typical photo
service offers. It brings together a calm browsing experience, rich metadata,
albums and tags, full video support, and an administration panel for the work
that happens behind the scenes.

The application is built with Next.js and PostgreSQL. Media bytes live in a
Drive gateway or Cloudflare R2, while a Cloudflare Worker takes care of durable
registration and an optional processor creates video derivatives.

This project grew out of and is substantially evolved from
[Sam Becker's EXIF Photo Blog](https://github.com/sambecker/exif-photo-blog),
especially its metadata-focused browsing ideas. It is now its own application,
with its own storage model, authentication, workers, registration lifecycle,
and deployment workflow.

> Project status: this is a vibe-coded, AI-assisted project under active
> development. It can contain bugs, incomplete behavior, and rough edges even
> when a feature appears to work. Review changes before production use, keep
> database and storage backups, test uploads and deletions with non-critical
> media first, and report reproducible failures with the relevant logs and
> deployment version. The project is being continuously audited and improved.

## What you get

- Authenticated media library with albums, tags, favourites, search, sorting,
  public pages, and responsive photo/video views.
- Direct-to-storage uploads and a resumable Windows folder uploader.
- Drive gateway or Cloudflare R2 storage. Complete Drive configuration takes
  priority over R2.
- PostgreSQL metadata using either Neon or Supabase.
- FIFO, resumable registration with per-file status and safe source cleanup.
- Optional video processing for previews, posters, subtitles, stream files, and
  HLS artifacts.

If you only want the short version: configure PostgreSQL and one storage
provider, start the panel, create the first admin at `/setup`, upload one test
file, and then connect the registration Worker. The rest of the system can be
added as your library grows.

## Contents

- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Main environment variables](#main-required-environment-variables)
- [Database and storage](#database-setup-neon-or-supabase)
- [Admin configuration](#admin-panel-configuration-map)
- [Media lifecycle](#media-lifecycle-and-worker-states)
- [Uploading and video processing](#uploading-media)
- [Worker deployment](#deploying-the-cloudflare-registration-worker)
- [Development and release checks](#development-and-verification)
- [Troubleshooting](#troubleshooting-quick-reference)
- [Contributing and adapting](#contributing-and-adapting)
- [Security](#security-and-operations)

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

Upload, registration, and processing are separate phases. A file visible in
storage is only **detected**; it becomes library media after the orchestrator
commits its media row and upload mapping.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- PostgreSQL-compatible database: Neon or Supabase
- Drive gateway or Cloudflare R2
- Cloudflare account for the registration Worker
- Python 3 on Windows if the folder uploader is used

## Local setup

```bash
git clone https://github.com/iamnadith/media-panel.git
cd media-panel
pnpm install
cp .env.example .env       # PowerShell: Copy-Item .env.example .env
pnpm dev
```

Open the panel URL and visit `/setup` to create the first super-admin. Use the
admin Configuration page to confirm runtime processing settings and storage
behavior.

Never commit `.env`. Use different long random values for `AUTH_SECRET`, the
orchestrator secret, the processor secret, and automation secrets.

### Main required environment variables

For the panel itself, start with these values:

```env
NEXT_PUBLIC_DOMAIN=https://your-panel.example.com
AUTH_SECRET=generate-a-long-random-secret
POSTGRES_URL=postgresql://user:password@host/database?sslmode=require
```

Configure exactly one complete storage provider. Drive takes priority when its
four main values are present:

```env
DRIVE_STORAGE_BASE_URL=https://your-drive.example.com/storage
DRIVE_STORAGE_API_KEY=your-drive-project-api-key
NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID=your-drive-project-id
NEXT_PUBLIC_DRIVE_STORAGE_BUCKET=your-bucket
```

If using Cloudflare R2 instead, leave the Drive values unset and configure:

```env
CLOUDFLARE_R2_ACCESS_KEY=your-r2-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-r2-secret-key
NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID=your-cloudflare-account-id
NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET=your-bucket
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN=https://your-public-r2-domain.example.com
```

The registration Worker additionally needs these values available to its
deployment bootstrap and panel connection:

```env
MEDIA_PANEL_BASE_URL=https://your-panel.example.com
BACKEND_ORCHESTRATOR_BASE_URL=https://your-orchestrator.workers.dev
BACKEND_ORCHESTRATOR_SHARED_SECRET=another-long-random-secret
```

The optional video processor needs:

```env
BACKEND_PROCESSOR_SHARED_SECRET=a-separate-long-random-secret
```

### Environment files and their variables

These are the variables currently present in the checked-out environment
files. Values are intentionally omitted from the README.

#### Root `.env` - Media Panel

```env
# Main panel, authentication, and database
NEXT_PUBLIC_DOMAIN=
NEXT_PUBLIC_META_TITLE=
AUTH_SECRET=
POSTGRES_URL=

# Drive storage used by the current panel setup
DRIVE_STORAGE_BASE_URL=
DRIVE_STORAGE_API_KEY=
NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID=
NEXT_PUBLIC_DRIVE_STORAGE_BUCKET=

# Worker connection and automation
BACKEND_ORCHESTRATOR_BASE_URL=
BACKEND_ORCHESTRATOR_SHARED_SECRET=
BACKEND_PROCESSOR_SHARED_SECRET=
AUTOMATION_API_SECRET=

# Current media/performance options
NEXT_PUBLIC_UNIQUE_MEDIA_NAMES=
NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA=
NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_CATEGORIES=

# Optional services currently configured in this file
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Optional SMS verification; Text.lk is the current gateway integration
TEXTLK_API_TOKEN=
TEXTLK_SENDER_ID=
```

For a new setup, the main required root values are `NEXT_PUBLIC_DOMAIN`,
`AUTH_SECRET`, `POSTGRES_URL`, and one complete storage provider. The Worker
variables are needed when registration is enabled. Google login and Resend are
optional. Text.lk is the current SMS gateway used by the built-in SMS
verification flow:

```env
TEXTLK_API_TOKEN=your-textlk-api-token
TEXTLK_SENDER_ID=your-sender-id
```

SMS is optional; email verification remains available without it. If you
prefer another SMS provider, replace the provider request in
`src/auth/users.ts` and adjust the corresponding environment variable names,
request format, sender configuration, and error handling for that provider.

#### `workers/backend-orchestrator/.env`

```env
MEDIA_PANEL_BASE_URL=
BACKEND_ORCHESTRATOR_SHARED_SECRET=
```

These are used by the panel-assisted Wrangler deployment. Production Worker
runtime secrets are supplied by the panel deployment configuration.

#### `workers/backend-processor/.env`

This file is not currently present in the checkout. Create it from
[`workers/backend-processor/.env.example`](workers/backend-processor/.env.example):

```env
BACKEND_ORCHESTRATOR_BASE_URL=
BACKEND_PROCESSOR_SHARED_SECRET=
```

The remaining supported defaults are documented in [`.env.example`](.env.example).
Do not copy unrelated or legacy values into a deployment without checking the
current Admin Configuration page and source.

### First-run order

1. Create PostgreSQL and a storage provider.
2. Create `.env` from `.env.example` and set only the required values for the
   provider you selected.
3. Start the panel and finish `/setup` to create the first super-admin.
4. Open **Admin -> Configuration** and complete **Storage**, **Authentication**,
   and **Processing**. The panel creates its required application tables on
   demand; do not manually invent a schema for a fresh installation.
5. Upload one small test image and confirm it appears in the library before
   uploading a larger folder.
6. Deploy the Backend Orchestrator and confirm `/health`, `/status`, and the
   Admin **Processing** page.
7. Start the optional Backend Processor only after registration is healthy and
   video processing is enabled for the features you need.

The first test should cover the complete lifecycle: upload, registration,
library display, playback, metadata editing, and deletion. Keep the original
test file until the deletion queue reports completion.

### What creates the database schema

The panel and orchestrator use idempotent `CREATE TABLE IF NOT EXISTS` setup
for their own runtime tables. The core media, album, authentication, subtitle,
processing-configuration, application-configuration, upload-registration,
registration-status, activity-log, scan-lease, registered-file-map, and
deletion-queue tables are created or upgraded when the corresponding feature is
used. Older installations can run migrations automatically when a known schema
error is detected.

This is not a substitute for backups or a migration review. Do not delete
tables to fix an application error, and do not run destructive SQL against a
production database without a verified backup.

## Database setup: Neon or Supabase

The panel accepts one normal PostgreSQL connection URI in `POSTGRES_URL`.

### Neon

Use the Neon pooled or direct URI. SSL is enabled automatically; no extra
flag is required:

```env
POSTGRES_URL=postgresql://user:password@ep-example-pooler.region.aws.neon.tech/dbname?sslmode=require
```

### Supabase

Use the Supabase transaction-pooler URI (normally port `6543`). Supabase
compatibility mode disables the client-side TLS layer automatically:

```env
POSTGRES_URL=postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
```

`DISABLE_POSTGRES_SSL` is optional. Leave it unset for provider-aware behavior:
Supabase disables TLS for pooler compatibility and Neon keeps strict TLS. Set
it to `1` or `0` only when an explicit override is needed; an explicit value
wins over automatic detection and is passed to the Worker deployment config.

The panel passes the URI and resolved SSL mode to the orchestrator's generated
Worker secrets. The SSL flag can remain unset in the panel environment. Do not
expose `POSTGRES_URL` to the browser.

## Environment variables

`.env.example` is the source-of-truth template. Empty values are optional unless
the related feature is enabled.

### Panel and database

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DOMAIN` | Canonical panel URL, including `https://`. |
| `NEXT_PUBLIC_DOMAIN_SHARE` | Optional share/public URL override. |
| `NEXT_PUBLIC_LOCALE` | Default locale. |
| `NEXT_PUBLIC_META_TITLE`, `NEXT_PUBLIC_META_DESCRIPTION` | Site metadata. |
| `NEXT_PUBLIC_NAV_TITLE`, `NEXT_PUBLIC_NAV_CAPTION`, `NEXT_PUBLIC_PAGE_ABOUT` | Navigation/about copy. |
| `AUTH_SECRET` | Auth.js session/signing secret. |
| `POSTGRES_URL` | Neon or Supabase PostgreSQL URI. |
| `DISABLE_POSTGRES_SSL` | Optional `1`/`0` override; otherwise provider-aware automatically. |

### Storage and uploads

| Variable | Purpose |
| --- | --- |
| `DRIVE_STORAGE_BASE_URL` | Drive gateway base URL. |
| `DRIVE_STORAGE_API_KEY` | Drive project API key. |
| `NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID` | Drive project identifier. |
| `NEXT_PUBLIC_DRIVE_STORAGE_BUCKET` | Drive bucket name. |
| `NEXT_PUBLIC_DRIVE_MULTIPART_THRESHOLD_BYTES` | Client multipart threshold. |
| `NEXT_PUBLIC_DRIVE_MULTIPART_PART_SIZE_BYTES` | Client multipart part size. |
| `NEXT_PUBLIC_DRIVE_MULTIPART_CONCURRENCY` | Upload part concurrency. |
| `NEXT_PUBLIC_DRIVE_MULTIPART_PART_URL_LOOKAHEAD` | Multipart URL prefetch window. |
| `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 S3 credentials for the panel. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID` | R2 account ID. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET` | R2 bucket name. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN` | R2 delivery/public domain. |

Drive is selected only when its complete configuration is present. Otherwise
the panel falls back to R2. Configure bucket CORS for the panel origin, `PUT`,
and the `ETag` response header when using browser multipart uploads.

### Orchestrator and processor

The panel's **Admin → Configuration → Processing** section is the preferred
place for the Worker URL, panel key, processor key, queue limits, and recovery
settings. Those values are stored in the database and are used by the panel
and deployment bootstrap. Environment variables below remain supported as a
first-install fallback.

| Variable | Purpose |
| --- | --- |
| `BACKEND_ORCHESTRATOR_BASE_URL` | Deployed registration Worker URL. |
| `BACKEND_ORCHESTRATOR_SHARED_SECRET` | Panel-to-orchestrator authentication. |
| `BACKEND_PROCESSOR_SHARED_SECRET` | Processor-to-orchestrator authentication. |
| `MEDIA_PANEL_BASE_URL` | Panel URL used by Worker deployment bootstrap. |
| `AUTOMATION_API_SECRET` | Server-side automation/revalidation secret. |
| `DRIVE_STORAGE_PROJECT_ID`, `DRIVE_STORAGE_BUCKET` | Worker-side Drive settings. |
| `R2_PUBLIC_BASE_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET` | Worker-side R2 settings. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Worker-side R2 S3 credentials. |
| `UNIQUE_MEDIA_NAMES` | Use generated unique media object names; enabled by default. Set `0` to disable. |
| `REGISTER_BATCH_SIZE` | Files attempted per registration pass; default `1`. Existing database settings override this deployment default. |
| `MAX_REGISTER_PASSES` | Registration passes per scheduled run; default `1`. Existing database settings override this deployment default. |
| `STALE_PROCESSING_MINUTES`, `STALE_REGISTRATION_MINUTES` | Lease recovery ages. |
| `REGISTRATION_HISTORY_DAYS` | Completed/error status retention. |
| `BACKEND_PROCESSOR_POLL_INTERVAL_MS` | Processor polling interval. |
| `BACKEND_PROCESSOR_IDLE_INTERVAL_MS` | Processor idle delay. |
| `BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS` | Processor lease heartbeat. |
| `BACKEND_PROCESSOR_CLAIM_LIMIT` | Processor jobs claimed per cycle. |

The registration worker uses a bounded FIFO slice on every scheduled run.
Waiting for one Drive copy does not block later files in the same slice, and
thousands of files remain resumable across scheduled runs without opening an
unbounded number of database connections.

### Authentication and notifications

| Variable | Purpose |
| --- | --- |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth credentials. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email verification and password reset. |
| `TEXTLK_API_TOKEN`, `TEXTLK_SENDER_ID` | Current Text.lk SMS gateway for optional SMS verification and 2FA. |

Google's callback URL is `https://YOUR_DOMAIN/api/auth/callback/google`.

### Optional services and AI

| Variable | Purpose |
| --- | --- |
| `KV_URL`, `UPSTASH_REDIS_REST_URL` | Redis/rate-limit backends. |
| `EXIF_KV_REST_API_URL`, `EXIF_KV_REST_API_TOKEN` | Optional EXIF KV compatibility. |
| `OPENAI_SECRET_KEY`, `OPENAI_BASE_URL` | Optional AI provider. |
| `AI_TEXT_AUTO_GENERATED_FIELDS` | AI fields, e.g. `title,tags,semantic`. |
| `GOOGLE_PLACES_API_KEY` | Optional location lookup. |

### Media, sorting, display, and diagnostics

In **Admin → Configuration → Performance**, use the four **Static
optimization** switches to choose which public artifacts are generated during
the next production build: media pages, media social images, category pages,
and category social images. Disabled types are generated on first visit and
served through the normal revalidation/cache paths. The setting is stored in
the project database, so no environment-variable edit is required. The
matching `NEXT_PUBLIC_STATICALLY_*` variables remain supported as defaults for
existing deployments until an administrator saves the panel settings.

Only the variables shown in the verified tables above and the relevant section
of [`.env.example`](.env.example) should be configured. The example file also
contains optional and compatibility switches for features that are not enabled
in every deployment; an unused variable does not activate a feature by itself.
The Admin Configuration page is the source of truth for settings that have a
panel toggle. Do not copy an arbitrary variable from an old deployment or a
search result without checking that the current source reads it.

Legacy aliases remain supported for existing deployments:
`NEXTAUTH_SECRET`, `CLOUDFLARE_WORKER_SHARED_SECRET`, `RESEND_FROM`,
`NEXT_PUBLIC_SITE_DOMAIN`,
`NEXT_PUBLIC_SITE_DESCRIPTION`, `NEXT_PUBLIC_SITE_TITLE`,
`NEXT_PUBLIC_SITE_ABOUT`, `NEXT_PUBLIC_STATICALLY_OPTIMIZE_PAGES`,
`NEXT_PUBLIC_STATICALLY_OPTIMIZE_OG_IMAGES`, `NEXT_PUBLIC_PRO_MODE`, and
`NEXT_PUBLIC_HIDE_SOCIAL`.

## Admin panel configuration map

The configuration page is grouped by the setting's ownership:

| Section | What it controls |
| --- | --- |
| Storage | Drive/R2 selection, bucket and delivery behavior. |
| Processing | Orchestrator connection, processor connection, queue limits, retries, leases, and recovery. |
| Authentication | Site access, OAuth, email verification, and role behavior. |
| Content | Media metadata, upload behavior, and content defaults. |
| External Services | Optional location, Redis, email, and other integrations. |
| AI Text | AI provider and automatic metadata generation. |
| Performance | Static page and social-image generation switches stored in the database. |
| Categories | Public category visibility and category behavior. |
| Sorting | Default and priority/color sort behavior. |
| Display / Grid / Design | EXIF, grid density, themes, matting, and visual preferences. |
| Settings | Privacy, downloads, feeds, and other site settings. |
| Scripts & Analytics | Optional page scripts and analytics settings. |
| Internal | Debug-only controls; keep disabled in production. |

Panel-managed settings are persisted in PostgreSQL and normally take priority
over environment defaults after the first save. A setting that is shown as a
panel switch should not be documented as an env-var-only action.

## Media lifecycle and worker states

The system deliberately separates the following stages:

```text
local file -> upload -> storage object -> worker detection
           -> registration -> media row + registered file map
           -> optional video processing -> playback derivatives
           -> deletion queue -> storage cleanup + media removal
```

Useful registration states include `detected`, `registering`, `registered`,
`completed`, `retrying`, `failed`, and `cancelled` (the exact display text may
vary by page). Registration is durable and resumable. The Worker uses bounded,
oldest-first work, leases, per-file status, and retry/backoff handling; a large
file can remain in a waiting state while Drive completes a copy. Do not upload
the same file repeatedly just because the UI still says `registering`.

For a registration incident, check in this order:

1. Storage object existence, size, and read permissions.
2. Panel **Admin -> Processing** status and per-file registration records.
3. Worker `/health`, then authorized `/status` and `/logs`.
4. Worker deployment/build marker and cron activity.
5. PostgreSQL registration status, scan lease, and registered-file mapping.

Deletion is also asynchronous. The panel should immediately report the number
of files queued, then update per-file progress while the worker removes source,
poster, preview, and registered-upload objects. A UI spinner is not proof that
the file is still being deleted; the queue status and Worker logs are the
authoritative evidence.

## Main routes and operational endpoints

| Area | Routes |
| --- | --- |
| Public library | `/`, `/full`, `/grid`, `/recents`, `/favorites`, `/search`, and entity pages such as `/album/...`, `/tag/...`, `/studio/...`, `/performer/...`, `/year/...`, `/lens/...`, `/shot-on/...`, `/recipe/...`, `/film/...`, and `/focal/...`. |
| Public media | `/<photoId>` and entity-scoped media detail routes. |
| Admin | `/admin/media`, `/admin/uploads`, `/admin/processing`, `/admin/insights`, `/admin/stats`, `/admin/configuration`, and entity management pages. |
| Auth/setup | `/setup`, `/sign-in`, `/sign-up`, `/profile`, password reset, and verification routes. |
| Panel APIs | Authenticated media, upload, processing, deletion-status, full-video, subtitle, storage, revalidation, and deployment-config endpoints. |
| Worker | `/health`, `/status`, `/logs`, registration/recovery endpoints, and the scheduled scan. |

Do not expose authenticated Worker endpoints publicly. Use the configured
Bearer secret and least-privilege Cloudflare credentials.

## Uploading media

The browser uploader is suitable for normal uploads and uses the configured
storage provider. The Windows folder uploader is resumable and stores its state
outside the repository under the platform's application-data directory. It
keeps completed multipart work, supports retries and bounded file/part
concurrency, and uploads files only; the Worker remains responsible for
registration.

```powershell
pnpm upload:folder
```

Use the GUI to enter the Drive URL, API key, project, bucket, source folder,
recursive mode, file/part concurrency, and part size. For a stopped upload,
restart the uploader with the same profile and source folder so its state can
resume. Do not delete its state file while recovery is needed. Credentials are
kept separately from the upload trace and should never be committed.

The uploader's successful message means the object reached storage, not that a
media row already exists. Wait for the Worker scan and verify the file in Admin
Processing before treating the upload as registered.

## Video processing and playback

Video registration and video derivative processing are independent. The
optional processor can create posters, previews, subtitles, compatibility
streams, and HLS artifacts depending on the enabled configuration and source
media. Original video delivery remains the fallback and should be tested before
relying on a derivative.

For large files, keep processing concurrency bounded, allow enough temporary
disk space for FFmpeg, and use a bounded one-batch diagnostic run when
investigating processor failures.
Inspect orchestrator job state and processor output before retrying a failed
job. Repeated retries without checking the underlying storage, range request,
or FFmpeg error can create unnecessary work.

## Testing and release checklist

Before a release or deployment:

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm lint
pnpm test -- --runInBand
pnpm build

cd workers/backend-orchestrator
pnpm install
pnpm test
pnpm run build

cd ../backend-processor
pnpm install
pnpm test
pnpm run build
```

Then verify a staging or test account with one image, one video, a large or
slow registration, a delete of one file and a batch delete, a public page, a
media detail page, and an authenticated admin page. Confirm that the deployed
Worker health response reports the expected build marker. A local build does
not prove that the deployed Worker, database, Drive endpoint, or storage CORS
configuration is healthy.

## Troubleshooting quick reference

| Symptom | First checks |
| --- | --- |
| Upload completed but media is missing | Confirm the storage object, Worker cron/health, registration record, and scan lease. |
| Registration retries repeatedly | Check Drive copy/readability, object size, endpoint logs, stale lease recovery, and the deployed Worker version before increasing retries. |
| Large files take a long time | Keep one bounded job per pass, verify range/copy support and timeouts, and allow the next scheduled pass to resume it. |
| Admin stats are empty | Confirm auth capability, database connection, automatic table creation, and Worker status tables. |
| Video will not play | Test original delivery and an authorized range request, then inspect poster/stream/HLS/processor status. |
| Public page is slow | Check static optimization switches in **Configuration -> Performance**, storage delivery latency, image derivatives, and cache headers. |
| Delete appears stuck | Check the deletion queue endpoint and Worker logs; queue acceptance and storage cleanup are separate events. |
| Browser upload fails | Check provider CORS, allowed methods/headers, public origin, multipart part size, and presigned URL expiry. |
| TLS/database errors | Verify the actual PostgreSQL provider/URI and SSL mode. A TLS handshake error is not a SQL query error. |

When reporting a bug, include the route, browser/device, media ID or safe file
identifier, timestamp with timezone, panel deployment version, Worker build
marker, and the relevant redacted log lines. Never include passwords, bearer
tokens, database URIs, or storage secrets.

## Contributing and adapting

Make the project your own. Anyone working with the repository can fork it,
modify the UI, replace a storage or messaging provider, add features, fix bugs,
or adapt the deployment to fit their own library. The codebase is intentionally
open to experimentation while it is being actively improved.

Before sharing a change, run the relevant tests and build, check the complete
media lifecycle with safe test files, and document any new environment
variables or database behavior. Keep credentials, personal media, generated
`.env` files, and production data out of commits. There is currently no license
file in this repository, so add the license that matches your intended use
before redistributing it as a separate product.

## Deploying the Cloudflare registration Worker

The Worker source is in [`workers/backend-orchestrator`](workers/backend-orchestrator).
Its Wrangler configuration enables invocation logs and a `* * * * *` schedule.

### Panel-assisted deployment

The deployment script requests Worker secret configuration from the panel's
`/api/processing/deployment-config` endpoint, writes it to a temporary protected
file, and runs Wrangler:

```powershell
cd workers/backend-orchestrator
$env:MEDIA_PANEL_BASE_URL = 'https://your-panel.example.com'
$env:BACKEND_ORCHESTRATOR_SHARED_SECRET = 'your-worker-secret'
pnpm install
pnpm test
pnpm run build
pnpm run deploy
```

The panel URL must be reachable from the deployment machine and the shared
secret must match the panel environment. Never commit the generated secrets
file.

### Direct Wrangler deployment

```powershell
cd workers/backend-orchestrator
pnpm install
pnpm exec wrangler login
pnpm run deploy:direct
```

For CI, use a scoped `CLOUDFLARE_API_TOKEN` with Workers Scripts edit/deploy
permissions and the correct Cloudflare account. Never print the token. Verify:

```powershell
Invoke-RestMethod https://your-orchestrator.workers.dev/health
```

The response includes the build marker. Authorized diagnostics are `GET
/status` and `GET /logs` with `Authorization: Bearer <BACKEND_ORCHESTRATOR_SHARED_SECRET>`.

## Video processor

The optional processor in [`workers/backend-processor`](workers/backend-processor)
claims video jobs and creates derivatives:

```bash
cd workers/backend-processor
npm ci
npm run build
npm start
```

It requires `BACKEND_ORCHESTRATOR_BASE_URL` and
`BACKEND_PROCESSOR_SHARED_SECRET`.

## GitHub Actions

The repository ships `.github/workflows/backend-processor.yml`. Pushes and pull
requests affecting `workers/backend-processor` run its build. A manual
`workflow_dispatch` runs one batch or a bounded number of minutes.

Add these under **Settings → Secrets and variables → Actions**:

- Secret: `BACKEND_PROCESSOR_SHARED_SECRET`
- Variable or secret: `BACKEND_ORCHESTRATOR_BASE_URL`

If `workers/backend-processor/.env` exists, the workflow uses it; otherwise it
creates a temporary environment file from those settings. Never commit that
file or database/storage secrets.

The orchestrator is deployed through Wrangler/panel-assisted deployment above.
If GitHub should deploy it automatically, create a separate protected workflow
for `workers/backend-orchestrator` and store a scoped `CLOUDFLARE_API_TOKEN` as
a GitHub secret. Keep production deployment secrets out of workflow output.

## Folder uploader

On Windows, install Python 3 and run:

```powershell
pnpm upload:folder
```

Uploads finish independently from registration. A new object may remain
`detected` or `registering` while the Worker verifies storage and commits it.

## Development and verification

```bash
pnpm lint
pnpm test
pnpm build
cd workers/backend-orchestrator
pnpm test
pnpm run build
```

After deployment, verify `/health`, then inspect `/status` and `/logs`. A
successful scan reports `scan_completed`; a successful file reports
`media_registered`. `registration_waiting_for_storage` means the source exists
but the generated destination is not readable yet and will be retried.

## Security and operations

- Never commit `.env`, PostgreSQL URIs, storage credentials, API keys, or Worker
  secrets.
- Keep `POSTGRES_URL` server-side; never use a `NEXT_PUBLIC_*` database value.
- Use distinct long random secrets for auth, orchestrator, processor, and
  automation access.
- Keep storage write credentials server-side and configure CORS only for required
  panel origins.
- `DISABLE_POSTGRES_SSL=1` removes client-side TLS for Supabase compatibility;
  use it only when necessary and protect the deployment environment.
- Treat media URLs, bucket origins, and public-page settings as part of the
  privacy model.

## Credits

Media Panel began as a customized foundation from
[EXIF Photo Blog by Sam Becker](https://github.com/sambecker/exif-photo-blog).
The current repository has its own media workflow, deployment model, storage
integration, authentication, and worker services.

