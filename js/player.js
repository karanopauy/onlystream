import { CONFIG } from "./config.js";
let hls = null, blobUrl = null, hlsLib = null;

function loadHlsLib() {
  if (globalThis.Hls) return Promise.resolve(globalThis.Hls);
  return hlsLib ??= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = CONFIG.HLS_JS_URL;
    s.onload = () => res(globalThis.Hls); s.onerror = () => { hlsLib = null; rej(new Error("Could not load hls.js.")); };
    document.head.append(s);
  });
}

// Rewrite every URI-bearing line/attribute to an absolute URL against the playlist's base,
// so a Blob URL (which has no useful base) cannot break relative references.
export function absolutizePlaylist(text, base) {
  const abs = u => { try { return new URL(u, base).href; } catch { return u; } };
  return text.split(/\r?\n/).map(line => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith("#")) return line.replace(/URI="([^"]*)"/g, (_, u) => `URI="${abs(u)}"`); // KEY, MAP, MEDIA, I-FRAME, PART, PRELOAD-HINT...
    return abs(t);
  }).join("\n");
}

export function teardown(video) {
  hls?.destroy(); hls = null;
  video.removeAttribute("src"); video.load();
  if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null;
}

// Returns when the engine is attached; throws on init failure. onFatal reports later fatal errors.
export async function load(video, media, onFatal) {
  teardown(video);
  if (media.type === "mp4") { video.src = media.url; video.load(); return; }
  blobUrl = URL.createObjectURL(new Blob([absolutizePlaylist(media.playlist, media.baseUrl)], { type: "application/vnd.apple.mpegurl" }));
  const Hls = await loadHlsLib().catch(() => null);
  if (Hls?.isSupported()) {
    const h = hls = new Hls();
    h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && hls === h) onFatal(`HLS error: ${d.details}`); });
    h.loadSource(blobUrl); h.attachMedia(video);
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = blobUrl; video.load();
  } else throw new Error("This browser cannot play HLS.");
}

export const fmtTime = s => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
