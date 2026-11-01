/**
 * Biometric Privacy & Synthetic Media Provenance Guard
 * Protects user facial references, voice cloning audio, and embeds synthetic provenance headers.
 */

export const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes max duration

/**
 * Validates that an uploaded reference file path belongs strictly to the authenticated user.
 * Format must strictly be: `<user_id>/<uuid>.<ext>`
 */
export function validateUserStoragePath(userId, storagePath) {
  if (!userId || !storagePath || typeof storagePath !== "string") return false;
  const escapedUser = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedUser}/[0-9a-f-]{36}\\.(?:png|jpg|jpeg|webp|wav|mp3|ogg)$`, "i");
  return pattern.test(storagePath);
}

/**
 * Creates an ephemeral pre-signed URL for private storage assets with a 15-minute expiration.
 */
export async function createEphemeralSignedUrl(supabaseClient, bucket, filePath, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
  if (!supabaseClient || !bucket || !filePath) {
    throw new Error("Parámetros insuficientes para generar enlace temporal firmado.");
  }

  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(filePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "No se pudo generar la URL segura temporal.");
  }

  return {
    signedUrl: data.signedUrl,
    expiresInSeconds: ttlSeconds,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

/**
 * Injects synthetic media provenance & C2PA compliance headers on outbound responses
 */
export function applySyntheticMediaHeaders(res, options = {}) {
  if (!res || typeof res.setHeader !== "function") return;

  // Provenance headers for synthetic AI media compliance (EU AI Act & US Deepfake standards)
  res.setHeader("X-Synthetic-Media", "true");
  res.setHeader("X-Media-Provenance", options.provenance || "Insomnia-Kineva-AI-v2");
  res.setHeader("X-Generation-Engine", options.engine || "kineva-multishot");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-transform, max-age=900");
}
