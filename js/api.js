import { CONFIG } from "./config.js";
import { generateXcessHeader } from "./xcess.js";

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
const apiOrigin = () => new URL(CONFIG.API_BASE).origin;

// The ONLY path to the network for API calls. Fresh header on every call (and so every retry).
export async function authenticatedFetch(url, { signal } = {}) {
  if (!CONFIG.XCESS_PUBLIC_KEY_PEM.trim() || !CONFIG.XCESS_HEADER_NAME.trim())
    throw new ApiError("config", "Missing configuration: set XCESS_PUBLIC_KEY_PEM and XCESS_HEADER_NAME in js/config.js.");
  if (!globalThis.crypto?.subtle || !crypto.randomUUID)
    throw new ApiError("secure-context", "Web Crypto is unavailable. Serve this app over HTTPS (or localhost).");
  let target;
  try { target = new URL(url); } catch { throw new ApiError("unexpected", "Invalid API URL."); }
  if (target.origin !== apiOrigin()) throw new ApiError("unexpected", "Refusing request to an unapproved origin.");

  let header;
  try { header = await generateXcessHeader(CONFIG.XCESS_PUBLIC_KEY_PEM); }
  catch (e) { throw new ApiError("xcess", "Could not generate the Xcess header: " + e.message); }

  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctl.abort("timeout"), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, { method: "GET", headers: { [CONFIG.XCESS_HEADER_NAME]: header }, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) throw new ApiError("auth", `The API rejected authentication (HTTP ${res.status}). Check the public key, header name and server clock.`);
    if (!res.ok) throw new ApiError("http", `The API returned HTTP ${res.status}.`);
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (signal?.aborted) throw new ApiError("aborted", "Request cancelled.");
    if (ctl.signal.aborted) throw new ApiError("timeout", "The request timed out. Try again.");
    throw new ApiError("network", "Network or CORS failure. If the console shows a preflight error, the API must allow this origin and the configured header (OPTIONS).");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

async function json(res) {
  try { return await res.json(); } catch { throw new ApiError("json", "The API returned invalid JSON."); }
}

export async function discoverStreams(videoKey, signal) {
  const u = new URL(CONFIG.API_BASE); u.search = new URLSearchParams({ videoKey }).toString();
  const body = await json(await authenticatedFetch(u.href, { signal }));
  if (!body || body.status !== 200 || !Array.isArray(body.result))
    throw new ApiError("api", `The API reported a failure (status ${body?.status ?? "unknown"}). Check the video key.`);
  const streams = body.result.filter(s => s && typeof s.videoPath === "string" && Number.isFinite(Number(s.quality)) && typeof s.format === "string")
    .map(s => ({ videoPath: s.videoPath, quality: Number(s.quality), format: s.format.toLowerCase(), segmentFormats: s.segmentFormats ?? null }));
  if (body.result.length && !streams.length) throw new ApiError("unexpected", "The API returned streams in an unexpected shape.");
  return streams.sort((a, b) => b.quality - a.quality || a.format.localeCompare(b.format));
}

// Resolve ONLY the chosen stream. Returns {type:"hls", playlist, baseUrl} or {type:"mp4", url}.
export async function resolveStream(stream, signal) {
  const body = await json(await authenticatedFetch(stream.videoPath, { signal }));
  if (!body || body.status !== 200 || typeof body.result !== "string")
    throw new ApiError("api", "Stream resolution failed or returned an unexpected structure.");
  return stream.format === "hls" ? adaptHls(body, stream) : adaptMp4(body);
}

function adaptHls(body, stream) {
  if (!body.result.trimStart().startsWith("#EXTM3U")) throw new ApiError("unexpected", "Expected an HLS playlist but received something else.");
  return { type: "hls", playlist: body.result, baseUrl: stream.videoPath };
}

// MP4 ADAPTER: the MP4 resolver contract is NOT documented. Only the case
// {result: "<http(s) URL>", status:200} is handled. Anything else fails loudly.
function adaptMp4(body) {
  let u; try { u = new URL(body.result); } catch { u = null; }
  if (!u || !/^https?:$/.test(u.protocol))
    throw new ApiError("unexpected", "MP4 resolver response format is not recognised. Edit adaptMp4() in js/api.js once the contract is known.");
  return { type: "mp4", url: u.href };
}
