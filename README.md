# Media Panel

Media Panel is a private, self-hosted media library for photos and videos. It
combines a Next.js panel, PostgreSQL metadata, Drive or Cloudflare R2 storage,
a Cloudflare Worker registration service, and an optional background video
processor.

It is based on and substantially evolved from [Sam Becker's EXIF Photo Blog](https://github.com/sambecker/exif-photo-blog).
This repository is its own media application and does not bundle or present
itself as the EXIF Photo Blog photo-library project.

## Features and architecture

- Authenticated media library with albums, tags, favourites, search, sorting,
  public pages, and responsive photo/video views.
- Direct-to-storage uploads and a resumable Windows folder uploader.
- Drive gateway or Cloudflare R2 storage. Complete Drive configuration takes
  priority over R2.
- PostgreSQL metadata using either Neon or Supabase.
- FIFO, resumable registration with per-file status and safe source cleanup.
- Optional video processing for previews, posters, subtitles, stream files, and
  HLS artifacts.

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

## Database setup: Neon or Supabase

The panel accepts one normal PostgreSQL connection URI in `POSTGRES_URL`.

### Neon

Use the Neon pooled or direct URI and leave SSL enabled:

```env
POSTGRES_URL=postgresql://user:password@ep-example-pooler.region.aws.neon.tech/dbname?sslmode=require
DISABLE_POSTGRES_SSL=0
```

### Supabase

Use the Supabase transaction-pooler URI (normally port `6543`):

```env
POSTGRES_URL=postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
DISABLE_POSTGRES_SSL=1
```

For this project, `DISABLE_POSTGRES_SSL=1` tells the Node PostgreSQL client to
disable its TLS layer for the Supabase connection. This is the compatibility
setting used when Supabase's pooler certificate/handshake causes connection
failures. Set it only for the Supabase deployment that requires it; keep
`DISABLE_POSTGRES_SSL=0` for Neon and normal verified TLS connections.

The same URI and flag must be present in the panel environment and in the
orchestrator's generated Worker secrets. Do not expose `POSTGRES_URL` to the
browser.

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
| `DISABLE_POSTGRES_SSL` | `1` for required Supabase compatibility mode; normally `0`. |
| `MEDIA_ID_FORWARDING_TABLE` | Optional legacy media-ID forwarding table. |

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

| Variable | Purpose |
| --- | --- |
| `BACKEND_ORCHESTRATOR_BASE_URL` | Deployed registration Worker URL. |
| `BACKEND_ORCHESTRATOR_SHARED_SECRET` | Panel-to-orchestrator authentication. |
| `BACKEND_PROCESSOR_SHARED_SECRET` | Processor-to-orchestrator authentication. |
| `BACKEND_PROCESSOR_ID` | Optional stable processor identity. |
| `MEDIA_PANEL_BASE_URL` | Panel URL used by Worker deployment bootstrap. |
| `AUTOMATION_API_SECRET` | Server-side automation/revalidation secret. |
| `DRIVE_STORAGE_PROJECT_ID`, `DRIVE_STORAGE_BUCKET` | Worker-side Drive settings. |
| `R2_PUBLIC_BASE_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET` | Worker-side R2 settings. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Worker-side R2 S3 credentials. |
| `UNIQUE_MEDIA_NAMES` | Use generated unique media object names (`1` or `0`). |
| `REGISTER_BATCH_SIZE` | Files attempted per registration pass; default `2`. |
| `MAX_REGISTER_PASSES` | Registration passes per scheduled run; default `2`. |
| `STALE_PROCESSING_MINUTES`, `STALE_REGISTRATION_MINUTES` | Lease recovery ages. |
| `REGISTRATION_HISTORY_DAYS` | Completed/error status retention. |
| `BACKEND_PROCESSOR_POLL_INTERVAL_MS` | Processor polling interval. |
| `BACKEND_PROCESSOR_IDLE_INTERVAL_MS` | Processor idle delay. |
| `BACKEND_PROCESSOR_HEARTBEAT_INTERVAL_MS` | Processor lease heartbeat. |
| `BACKEND_PROCESSOR_CLAIM_LIMIT` | Processor jobs claimed per cycle. |
| `RUN_ONCE` | Processor mode: process one batch and exit when `1`. |

The registration worker uses a bounded FIFO slice on every scheduled run.
Waiting for one Drive copy does not block later files in the same slice, and
thousands of files remain resumable across scheduled runs without opening an
unbounded number of database connections.

### Authentication and notifications

| Variable | Purpose |
| --- | --- |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth credentials. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email verification and password reset. |
| `TEXTLK_API_TOKEN`, `TEXTLK_SENDER_ID` | Text.lk SMS verification/2FA. |

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

These remaining supported variables are also available in `.env.example`:

```text
NEXT_PUBLIC_UNIQUE_MEDIA_NAMES NEXT_PUBLIC_PRESERVE_ORIGINAL_UPLOADS
NEXT_PUBLIC_TRANSCODE_VIDEOS_ON_ADD NEXT_PUBLIC_GENERATE_STREAM_DERIVATIVES
NEXT_PUBLIC_IMAGE_QUALITY NEXT_PUBLIC_BLUR_DISABLED
NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_OG_IMAGES
NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_CATEGORIES NEXT_PUBLIC_STATICALLY_OPTIMIZE_MEDIA_CATEGORY_OG_IMAGES
NEXT_PUBLIC_CATEGORY_VISIBILITY NEXT_PUBLIC_HIDE_CATEGORIES_ON_MOBILE
NEXT_PUBLIC_HIDE_CATEGORY_IMAGE_HOVERS NEXT_PUBLIC_EXHAUSTIVE_SIDEBAR_CATEGORIES
NEXT_PUBLIC_HIDE_TAGS_WITH_ONE_MEDIA NEXT_PUBLIC_DEFAULT_SORT
NEXT_PUBLIC_PRIORITY_BASED_SORTING NEXT_PUBLIC_COLOR_SORT
NEXT_PUBLIC_COLOR_SORT_STARTING_HUE NEXT_PUBLIC_COLOR_SORT_CHROMA_CUTOFF
NEXT_PUBLIC_NAV_SORT_CONTROL NEXT_PUBLIC_HIDE_KEYBOARD_SHORTCUT_TOOLTIPS
NEXT_PUBLIC_HIDE_EXIF_DATA NEXT_PUBLIC_HIDE_ZOOM_CONTROLS NEXT_PUBLIC_HIDE_TAKEN_AT_TIME
NEXT_PUBLIC_HIDE_REPO_LINK NEXT_PUBLIC_GRID_HOMEPAGE NEXT_PUBLIC_GRID_ASPECT_RATIO
NEXT_PUBLIC_SHOW_LARGE_THUMBNAILS NEXT_PUBLIC_DEFAULT_THEME NEXT_PUBLIC_MATTE_MEDIA
NEXT_PUBLIC_MATTE_COLOR NEXT_PUBLIC_MATTE_COLOR_DARK NEXT_PUBLIC_GEO_PRIVACY
NEXT_PUBLIC_ALLOW_PUBLIC_DOWNLOADS NEXT_PUBLIC_SOCIAL_NETWORKS NEXT_PUBLIC_SITE_FEEDS
NEXT_PUBLIC_OG_TEXT_ALIGNMENT PAGE_SCRIPT_URLS VERCEL_AUTOMATION_BYPASS_SECRET
ADMIN_DEBUG_TOOLS ADMIN_SQL_DEBUG ANALYZE
```

Legacy aliases remain supported for existing deployments:
`NEXTAUTH_SECRET`, `CLOUDFLARE_WORKER_SHARED_SECRET`, `RESEND_FROM`,
`TEXT_LK_API_TOKEN`, `TEXT_LK_SENDER_ID`, `NEXT_PUBLIC_SITE_DOMAIN`,
`NEXT_PUBLIC_SITE_DESCRIPTION`, `NEXT_PUBLIC_SITE_TITLE`,
`NEXT_PUBLIC_SITE_ABOUT`, `NEXT_PUBLIC_STATICALLY_OPTIMIZE_PAGES`,
`NEXT_PUBLIC_STATICALLY_OPTIMIZE_OG_IMAGES`, `NEXT_PUBLIC_PRO_MODE`, and
`NEXT_PUBLIC_HIDE_SOCIAL`.

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
`BACKEND_PROCESSOR_SHARED_SECRET`. Set `RUN_ONCE=1` for one-batch checks.

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

