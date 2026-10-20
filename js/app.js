import { discoverStreams, resolveStream, ApiError } from "./api.js";
import * as player from "./player.js";
import { loadProgress, saveProgress, clearProgress, SAVE_INTERVAL } from "./storage.js";

const $ = id => document.getElementById(id);
const v = $("video");
const state = { key: null, streams: [], selected: 0, current: null, ctl: null, token: 0, busy: false };

function msg(text, info = false, retry) {
  const m = $("msg"); m.textContent = text || ""; m.hidden = !text; m.className = "msg" + (info ? " info" : "");
  if (text && retry) { const b = document.createElement("button"); b.textContent = "Retry"; b.style.marginLeft = ".6rem"; b.onclick = retry; m.append(b); }
}
function overlay(text, busy = false) { const o = $("overlay"); o.textContent = text || ""; o.dataset.busy = busy ? "1" : ""; }
function setBusy(b) { state.busy = b; $("findBtn").disabled = b; $("playSelected").disabled = b; }

// Accept a URL containing videoKey, or a bare key (opaque token with no URL-ish characters).
export function parseInput(raw) {
  const s = raw.trim();
  if (!s) throw new Error("Enter a video link or key.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let u; try { u = new URL(s); } catch { throw new Error("That link is malformed."); }
    const k = u.searchParams.get("videoKey")?.trim();
    if (!k) throw new Error("That link has no videoKey parameter.");
    return k;
  }
  if (/[\s/?&#=]/.test(s)) throw new Error("Enter a full link with ?videoKey=… or a plain video key.");
  return s;
}

function newRequest() { state.ctl?.abort(); state.ctl = new AbortController(); return { signal: state.ctl.signal, token: ++state.token }; }
function describe(e) { return e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong."; }

async function discover(key) {
  const { signal, token } = newRequest();
  saveNow(); player.teardown(v); state.current = null; state.key = key;
  $("controls").hidden = true; $("streams").hidden = true; $("empty").hidden = true; msg("");
  overlay("Finding streams…", true); setBusy(true);
  try {
    const streams = await discoverStreams(key, signal);
    if (token !== state.token) return;
    if (!streams.length) { overlay(""); $("empty").hidden = false; return msg("No streams are available for this key. Check the key or try another."); }
    state.streams = streams; state.selected = 0; renderStreams(); overlay("Choose a stream and press Play.");
  } catch (e) {
    if (token !== state.token || e.kind === "aborted") return;
    overlay(""); $("empty").hidden = false; msg(describe(e), false, () => discover(key));
  } finally { if (token === state.token) setBusy(false); }
}

function renderStreams() {
  const list = $("streamList"); list.replaceChildren();
  state.streams.forEach((s, i) => {
    const l = document.createElement("label"); l.className = "opt";
    const r = document.createElement("input"); r.type = "radio"; r.name = "stream"; r.checked = i === state.selected; r.onchange = () => state.selected = i;
    const t = document.createElement("span"); t.textContent = `${s.quality}p ${s.format.toUpperCase()}`;
    const m = document.createElement("small");
    m.textContent = s.segmentFormats ? Object.values(s.segmentFormats).join(", ") : "";
    l.append(r, t, m); list.append(l);
  });
  $("streams").hidden = false;
}

async function play() {
  const stream = state.streams[state.selected]; if (!stream || state.busy) return;
  saveNow();
  const resume = state.current && state.current.key === state.key ? v.currentTime : null;
  const { signal, token } = newRequest();
  setBusy(true); msg(""); overlay("Resolving stream…", true);
  try {
    const media = await resolveStream(stream, signal);
    if (token !== state.token) return;
    overlay("Starting playback…", true);
    await player.load(v, media, text => { if (token === state.token) { overlay(""); msg(text); } });
    if (token !== state.token) return;
    state.current = { key: state.key, quality: stream.quality, format: stream.format };
    state.pendingSeek = resume ?? loadProgress(state.key, stream.quality, stream.format);
    state.restored = resume == null;
    $("controls").hidden = false; $("nowPlaying").textContent = `${stream.quality}p ${stream.format.toUpperCase()}`;
    try { await v.play(); overlay(""); }
    catch { const b = document.createElement("button"); b.textContent = "Play"; b.className = "primary"; b.onclick = () => { v.play(); overlay(""); }; overlay(""); $("overlay").append(b); msg("Autoplay was blocked. Press Play to start.", true); }
  } catch (e) {
    if (token !== state.token || e.kind === "aborted") return;
    overlay(""); msg(describe(e), false, play);
  } finally { if (token === state.token) setBusy(false); }
}

// ---- media events keep controls in sync ----
const sync = () => {
  $("playBtn").dataset.state = v.paused ? "paused" : "playing"; $("playBtn").setAttribute("aria-label", v.paused ? "Play" : "Pause");
  const m = v.muted || v.volume === 0;
  $("muteBtn").dataset.state = m ? "muted" : "on"; $("muteBtn").setAttribute("aria-label", m ? "Unmute" : "Mute"); $("vol").value = v.muted ? 0 : v.volume;
  wake();
};
const tick = () => {
  const d = v.duration, ok = Number.isFinite(d) && d > 0;
  $("seek").max = ok ? d : 0; $("seek").value = ok ? v.currentTime : 0; $("seek").disabled = !ok;
  $("time").textContent = `${player.fmtTime(v.currentTime)} / ${player.fmtTime(d)}`;
};
v.addEventListener("loadedmetadata", () => {
  const p = state.pendingSeek; state.pendingSeek = null;
  if (p != null && Number.isFinite(v.duration) && p > 1 && p < v.duration - 10) { v.currentTime = p; if (state.restored) msg(`Resumed from ${player.fmtTime(p)}.`, true); }
  tick();
});
["play", "pause", "volumechange"].forEach(e => v.addEventListener(e, sync));
["timeupdate", "durationchange"].forEach(e => v.addEventListener(e, tick));
v.addEventListener("waiting", () => overlay("Buffering…", true));
["playing", "canplay"].forEach(e => v.addEventListener(e, () => overlay("")));
v.addEventListener("pause", saveNow); v.addEventListener("seeked", saveNow);
v.addEventListener("ended", () => { const c = state.current; if (c) clearProgress(c.key, c.quality, c.format); });
v.addEventListener("error", () => { if (v.getAttribute("src")) { overlay(""); msg(`Playback failed${v.error?.message ? ": " + v.error.message : ""}. Try another stream.`); } });
function saveNow() { const c = state.current; if (c && v.currentTime > 0 && !v.ended && !state.pendingSeek) saveProgress(c.key, c.quality, c.format, v.currentTime); }
setInterval(() => { if (!v.paused) saveNow(); }, SAVE_INTERVAL);
document.addEventListener("visibilitychange", () => document.hidden && saveNow());
addEventListener("pagehide", () => { saveNow(); state.ctl?.abort(); });

// ---- controls ----
const toggle = () => v.paused ? v.play().catch(() => {}) : v.pause();
const seekBy = s => { if (Number.isFinite(v.duration)) v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + s)); };
const fs = () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  const st = $("stage");
  if (st.requestFullscreen) return st.requestFullscreen().catch(() => {});
  v.webkitEnterFullscreen?.(); // iPhone Safari: native player only; it manages orientation itself
};
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  $("fsBtn").dataset.state = on ? "exit" : "enter"; $("fsBtn").setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen");
  if (on && matchMedia("(orientation: portrait)").matches) screen.orientation?.lock?.("landscape").catch(() => {}); // needs fullscreen; unsupported on iOS/desktop
  if (!on) screen.orientation?.unlock?.();
  wake();
});

// ---- auto-hide controls ----
let idleTimer, lastPointer = "mouse", wasIdle = false;
function wake() {
  const st = $("stage"); st.classList.remove("idle"); clearTimeout(idleTimer);
  if (!v.paused && !v.ended) idleTimer = setTimeout(() => st.classList.add("idle"), 3000);
}
$("stage").addEventListener("pointerdown", e => { lastPointer = e.pointerType; wasIdle = $("stage").classList.contains("idle"); });
["pointermove", "pointerdown", "keydown", "focusin"].forEach(e => $("stage").addEventListener(e, wake));
$("stage").addEventListener("pointerleave", () => { if (!v.paused) { clearTimeout(idleTimer); idleTimer = setTimeout(() => $("stage").classList.add("idle"), 800); } });
$("playBtn").onclick = toggle; $("fsBtn").onclick = fs;
$("muteBtn").onclick = () => v.muted = !v.muted;
$("vol").oninput = e => { v.volume = +e.target.value; v.muted = false; };
$("seek").oninput = e => { if (Number.isFinite(v.duration)) v.currentTime = +e.target.value; };
v.addEventListener("click", () => {
  // On touch, a tap on hidden controls only reveals them; otherwise it toggles playback.
  if (lastPointer === "touch" && wasIdle) return;
  toggle();
});
$("playSelected").onclick = play;

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest("input:not([type=range]),textarea,select,[contenteditable]")) return;
  if (t.closest("button,a,summary") && (e.key === " " || e.key === "Enter")) return;
  if (t.matches("input[type=range]") && /^Arrow/.test(e.key)) return; // native slider behaviour
  if (!state.current) return;
  const k = e.key.toLowerCase(); let h = true;
  if (k === " " || k === "k") toggle();
  else if (k === "arrowleft") seekBy(-5); else if (k === "arrowright") seekBy(5);
  else if (k === "j") seekBy(-10); else if (k === "l") seekBy(10);
  else if (k === "arrowup") { v.muted = false; v.volume = Math.min(1, v.volume + .05); }
  else if (k === "arrowdown") v.volume = Math.max(0, v.volume - .05);
  else if (k === "m") v.muted = !v.muted; else if (k === "f") fs();
  else h = false; // Escape exits fullscreen natively
  if (h) e.preventDefault();
});

// ---- input + URL ----
function submit(raw) {
  let key; try { key = parseInput(raw); } catch (e) { return msg(e.message); }
  const u = new URL(location.href); u.searchParams.set("videoKey", key); // keeps unrelated params
  history.pushState(null, "", u); $("keyInput").value = key; discover(key);
}
$("keyForm").onsubmit = e => { e.preventDefault(); submit($("keyInput").value); };
addEventListener("popstate", () => { const k = new URL(location.href).searchParams.get("videoKey"); if (k) { $("keyInput").value = k; discover(k); } });
const initial = new URL(location.href).searchParams.get("videoKey");
if (initial?.trim()) { $("keyInput").value = initial.trim(); discover(initial.trim()); }
sync();
