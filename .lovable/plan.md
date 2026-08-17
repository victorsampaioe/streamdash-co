# Plan: Fix IPTV Playback Regression (Live & VOD)

Investigating the regression where Live TV and VOD (Movies/Series) stopped playing. The core issue seems to be related to recent changes in the `stream.ts` proxy and HLS manifest rewriting.

## User Review Required

> [!IMPORTANT]
> This plan focuses on fixing the playback regression without changing the current design.

## Proposed Changes

### 1. Proxy Core (`stream.ts`)
- **Fix HLS Segment Handling**: Ensure HLS segments (`.ts`, `.m4s`) are correctly identified and served when signed.
- **Improved Logging**: Add detailed `[STREAM DEBUG]` logs including full URL (masked), status, content-type, and headers.
- **Range Request Validation**: Verify and fix `206 Partial Content` handling for VOD to ensure seek integrity.
- **HMAC Signature Validation**: Ensure signature matches between Panel and Core (verify `CRON_SECRET` alignment).

### 2. Live TV (HLS)
- **Manifest Rewriting**: Fix `rewriteManifest` to correctly handle relative URLs and preserve all necessary parameters (`token`, `mode`, `via=core`).
- **CORS & Headers**: Ensure all headers needed for Hls.js are preserved and exposed.

### 3. VOD (Movies & Series)
- **URL Alignment**: Ensure the correct IPTV path is being constructed (e.g., `movie/user/pass/id.mp4`).
- **Fallback Logic**: Verify that the ladder of compatibility (Painel -> Core-VLC -> Core) is correctly reporting failures instead of failing silently.

### 4. Diagnostic
- **Admin HUD**: Ensure the Diagnostic HUD in the player correctly displays `X-Core-Error`, `X-Upstream-Status`, and codec information.

## Technical Details

- **File**: `src/routes/api/public/core/stream.ts`
  - Update `rewriteManifest` to handle more edge cases in HLS manifests.
  - Refine `GET` handler to better log upstream failures (403/404).
- **File**: `src/routes/player.$resellerId.tsx`
  - Ensure `handlePlay` correctly passes parameters to `getPlayerStreamUrl`.
  - Fix any potential hook violations or state management issues in the playback loop.

## Verification Plan

### Automated Tests
- Run `scripts/verify-core-stream.mjs` (if present and applicable) or a manual script to test Range requests.
- Verify HTTP 206 response for a sample VOD URL.
- Verify HTTP 200 and re-written content for a sample Live HLS URL.

### Manual Verification
- Test 1 Live Channel: Confirm it starts playing and segments are loading.
- Test 1 Movie: Confirm it starts, seek works, and Range requests are visible in Network tab.
- Test 1 Series Episode: Confirm the flow Season -> Episode -> Play works correctly.
