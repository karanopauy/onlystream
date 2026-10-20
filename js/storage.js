import { CONFIG } from "./config.js";
const KEY = "streamplayer:v1:progress";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const id = (k, q, f) => `${k}|${q}|${f}`;
export function loadProgress(k, q, f) { const e = read()[id(k, q, f)]; return e && Number.isFinite(e.position) ? e.position : null; }
export function saveProgress(k, q, f, position) {
  if (!Number.isFinite(position)) return;
  try { const all = read(); all[id(k, q, f)] = { videoKey: k, quality: q, format: f, position, updated: Date.now() }; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* unavailable or full */ }
}
export function clearProgress(k, q, f) { try { const a = read(); delete a[id(k, q, f)]; localStorage.setItem(KEY, JSON.stringify(a)); } catch {} }
export const SAVE_INTERVAL = CONFIG.SAVE_INTERVAL_MS;
