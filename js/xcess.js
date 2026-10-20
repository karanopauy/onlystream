// Fresh Xcess value per call: RSA-OAEP(SHA-256) over {ts, nonce}, Base64.
export async function generateXcessHeader(pem) {
  if (!globalThis.crypto?.subtle || !crypto.randomUUID) throw new Error("Web Crypto unavailable. Use HTTPS or localhost.");
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, "").replace(/-----END PUBLIC KEY-----/, "").replace(/\s+/g, "");
  if (!b64) throw new Error("Public key PEM is empty or malformed.");
  let bytes;
  try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch { throw new Error("Public key PEM is not valid Base64."); }
  const key = await crypto.subtle.importKey("spki", bytes.buffer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const payload = { ts: Date.now() / 1000, nonce: crypto.randomUUID() };
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(JSON.stringify(payload))));
  let s = ""; for (const b of enc) s += String.fromCharCode(b);
  return btoa(s);
}
