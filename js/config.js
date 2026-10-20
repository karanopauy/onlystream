// All configurable values live here.
export const CONFIG = {
  API_BASE: "https://piperstreamdown.j4052578.workers.dev/",
  XCESS_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx4migI8hmQtJDd1hyys7WBKDhVUp96mmbo2KHR2wXxg4wciT6Po5IuGaOR3Jd0OaB+bJExychF1v7l4YyeaFiQqG+y8O3/KORbDZrztZF4BvRhVgf/VZ++FGnDIl4ZUMPnSRVPtn1OwB6F8kQ7I5pV7I57NazEn5WyP8TliwuoHi2llB6OfMle31DrHvy2b9meIlVhMP1e79dNTrK/ShOt0eaqxT5evEUYwXVObUYiDPUldMqVRV6vlrcNfq8bF3LvvMkKLPWY59xb9lCjBgOUvInry4LwjKXiQhomMWLJs2ZP6ElY7Djh7NhSnYoPWA4/Zr9gChqsk1IRVop8AhbQIDAQAB-----END PUBLIC KEY-----", // REQUIRED: server-provided RSA public key (PEM, SPKI). Not invented.
  XCESS_HEADER_NAME: "xcess",    // REQUIRED: exact header name the API expects. Not invented.
  REQUEST_TIMEOUT_MS: 15000,
  SAVE_INTERVAL_MS: 5000,
  HLS_JS_URL: "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
};
