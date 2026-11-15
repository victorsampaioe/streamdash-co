# Stream Monitor — Vitrine Vídeo MP4 + Banner Cinematográfico (admin beta)

## Status — 15/11/2026

**Feature code integrated into the connected GitHub/Lovable project**:
- New admin-gated `/vitrine-video` route.
- New **Cinematográfico** option inside existing `/vitrine-banner` for administrators only.
- Legacy banner layouts remain unchanged for existing resellers.
- Admin control page includes shortcuts to both routes.
- A publish operation was requested through the Lovable connector, **returned `pending`**. No verification of a completed production deployment or signed-in UI was possible yet.

## Exact TMDB assets — zero generated characters/backdrops
- Reuses the project's server-only `TMDB_API_KEY`.
- Search, PT-BR title/overview, original `backdrop_path` and `poster_path`.
- Additional official backdrops loaded only from the chosen media's own TMDB ID.
- Poster fallback is letterboxed, not stretched.
- Movie BR release date certification / TV BR content rating when present.
- Top-ranked official YouTube trailer reference, Portuguese preferred. Uses
  `youtube-nocookie.com/embed/KEY` inside the **preview artwork**.
- No download or capture of YouTube embedded content.
- Premade AI images, reimagined characters, AI face generation: **not used**.

## Static banner
- 1080x1350, 1080x1080, 1080x1920, 1920x1080.
- High-res canvas PNG and JPG (JPEG quality .94).
- Official images, logo with alpha preserved, adjustable colors, lighting, poster,
  description, format, brand, contact, title, label and Stream Monitor watermark.
- No video element or play overlay is exported in static files.

## Video from authorized local MP4
- Supported layouts: 1080x1350 / 1080x1920.
- Authorized local MP4 upload (default maximum 350 MB).
- Select start time, 15/30/60-second sections, audio on/off.
- Visible preview draws real uploaded video frames.
- Real MP4 export is **conditioned on browser support** for `MediaRecorder`
  `video/mp4` with H.264 (and AAC if audio is chosen). The UI refuses unsupported
  browsers. A WebM renamed `.mp4` is never delivered.
- `captureStream(30)` requests 30 FPS, but browsers may drop frames. This is
  not equivalent to validated constant-frame-rate FFmpeg encoding.
- A valid ISO BMFF `ftyp` signature is checked before download. Exports should
  be externally checked with `ffprobe` before asserting precise codecs or
  frame rates on every browser.
- No file is uploaded to Cloudflare. Browser object URLs are revoked on cleanup.
- YouTube embed plays only in preview and is never included in exported MP4.
- If unsupported or unauthorized, static PNG/JPG is available instead.

## Admin quota settings and audit
- New additive `public.vitrine_video_render_audit` table, RLS enabled, no
  anonymous/authenticated table grants. Only admin-authorized service functions
  write/read it. Request UUID has unique index (idempotency).
- Default and per-reseller daily settings live in one
  `app_settings` key `vitrine_video_render_policy` and are adjustable by admin.
- **Reseller generation remains DISABLED.** No quota is enforced on admin
  testing, and reseller limits are not active until backend enforcement is
  built for reseller users.
- Activity shows completed count, failures, aggregate local MP4 bytes and error
  identifiers. These are **reported local exports**, not Cloudflare CPU usage.
- No video file content, IP address, customer credentials or TMDB secrets are
  persisted in the audit row.

## Cloudflare / costs — NOT activated
Account check via connector:
- 0 Containers applications.
- A Queue exists for Telegram delivery and is unrelated to this feature.
- R2 bucket listing and Workers Paid subscription checks returned HTTP 403.
- Workers Paid ($5+/mo), Containers FFmpeg execution, R2 and dedicated video
  Queue **were not enabled**, because account paid entitlements and usage caps
  cannot yet be confirmed. The user asked to check before activating paid services.
- Official prices checked 2026-11-15:
  - Workers Paid Containers include 375 vCPU-minutes, 25 GiB-hours memory and
    200 GB-hours disk; overages billed by CPU, memory and disk use.
  - R2 Standard includes 10 GB-month and request allowances; overage charges.
  - Queues Paid includes 1,000,000 monthly ops, then usage billing.
  For current detailed rates consult official Cloudflare docs.

## Licensing
- TMDB non-commercial/developer API license does not automatically authorize a
  paid commercial promotional SaaS. A commercial TMDB/content license and any
  underlying film artwork/trailer publication rights must be confirmed before
  releasing to resellers.
- Display approved official TMDB logo and the prescribed attribution.
- Only user-supplied MP4 with publication authorization may be exported.

## Functional acceptance tests still REQUIRED
1. Confirm completed Lovable publication — `pending` does not equal deployed.
2. Sign in as an actual admin. Confirm `/vitrine-video` opens and reseller
   sessions are denied.
3. Choose a real TMDB title; verify selected art always belongs to that ID.
4. Confirm YouTube embed works inside preview but is absent from MP4 capture.
5. Export PNG/JPG for each size and check logo, text and poster alignment.
6. Upload a **licensed** MP4 and test 15, 30 and 60 second exports with audio
   and without; externally validate real H.264/AAC and frame rate via ffprobe.
7. Test a browser without native MP4 encoding: show a clear message, no fake
   output, and static fallback.
8. Save quota settings and confirm `app_settings` readback; create one test
   MP4 and confirm a unique RLS-protected audit row. Check error logging.
9. Observe no changes to original Vitrine Banner templates and functionality.
10. Do not expand to resellers or activate cloud FFmpeg until commercial media
    rights and cloud billing/spend limits are sorted out.

## Sources
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://developer.themoviedb.org/docs/getting-started
- https://www.themoviedb.org/about/logos-attribution
