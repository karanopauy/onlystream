# Booth — static stream player

Vanilla HTML/CSS/JS, no build step. Needs HTTPS (or `localhost`) for Web Crypto.

## Configure (`js/config.js`)
- `XCESS_PUBLIC_KEY_PEM` — the server-provided RSA public key (`-----BEGIN PUBLIC KEY-----`, SPKI). Never put a private key here.
- `XCESS_HEADER_NAME` — the exact header name the API expects (it is not assumed as it might be rotated every once in a while).
- Also: `API_BASE`, `REQUEST_TIMEOUT_MS`, `SAVE_INTERVAL_MS`, `HLS_JS_URL` (hls.js pinned to 1.5.17).
Without both values the app shows a configuration error and sends nothing.

## Run locally
`python3 -m http.server 8000` then open `http://localhost:8000/?videoKey=KEY` (localhost counts as secure).

## Deploy
Upload the folder to GitHub Pages, Cloudflare Pages or any static host over HTTPS.

## Server-side requirements
- CORS: `Access-Control-Allow-Origin` for the deployed origin; answer `OPTIONS` preflight with `Access-Control-Allow-Headers` including the Xcess header name and `Access-Control-Allow-Methods: GET`.
- Replay protection is the server's job: validate the `ts` window and reject reused `nonce` values. The client cannot provide it.
- The app never uses `no-cors` or a proxy; CORS failures are reported as such.

## Behaviour notes / open items
- Discovery lists streams only. Pressing Play resolves just the selected one. Every API request, including retries, gets a fresh Xcess value; media/segment requests carry none.
- HLS: the playlist string from `result` is rewritten so every URI (segments, nested playlists, KEY/MAP/MEDIA `URI="…"`) is absolute, resolved against the stream's `videoPath`, then played via a Blob URL (hls.js, or native HLS on Safari). **Assumption:** relative references resolve against `videoPath`; confirm with the API owner. Nested playlists that themselves require Xcess are not supported.
- MP4: **the resolver contract is undocumented.** `adaptMp4()` in `js/api.js` accepts only `{"result":"<http(s) URL>","status":200}` and otherwise reports an error. Needed: one real MP4 resolver response.
- Progress is stored in `localStorage` (`streamplayer:v1:progress`) per key+quality+format; no auth data is stored.
- Switching streams keeps the current position when you press Play on another option.

## Testing status
Test passed
