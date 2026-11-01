import crypto from "node:crypto";

/**
 * Sliding Window & Leaky Bucket Rate Limiter
 */
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_DEFAULT = 40; // 40 req/min per IP
const MAX_HEAVY_JOBS_PER_MIN = 6; // Max video / novel generations per min per user

const ipHits = new Map();
const userHits = new Map();

/**
 * Check if an IP has exceeded the general API rate limit
 */
export function isIpRateLimited(ip, limit = MAX_REQUESTS_DEFAULT) {
  if (!ip) return false;
  const now = Date.now();
  const entry = ipHits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + WINDOW_MS;
    ipHits.set(ip, entry);
    cleanupMap(ipHits, now);
    return false;
  }

  entry.count += 1;
  ipHits.set(ip, entry);
  return entry.count > limit;
}

/**
 * Check if a user has exceeded heavy AI job rate limits
 */
export function isHeavyJobRateLimited(userId, limit = MAX_HEAVY_JOBS_PER_MIN) {
  if (!userId) return false;
  const now = Date.now();
  const entry = userHits.get(userId) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + WINDOW_MS;
    userHits.set(userId, entry);
    cleanupMap(userHits, now);
    return false;
  }

  entry.count += 1;
  userHits.set(userId, entry);
  return entry.count > limit;
}

function cleanupMap(map, now) {
  if (map.size > 5000) {
    for (const [key, val] of map.entries()) {
      if (now > val.resetAt) map.delete(key);
    }
  }
}

/**
 * Cloudflare Turnstile token verification
 * Validates invisible bot protection tokens without adding user friction.
 */
export async function verifyTurnstileToken(token, clientIp = "", options = {}) {
  const secretKey = options.secretKey || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  const fetchImpl = options.fetchImpl || fetch;

  // If secret key is not configured (e.g. dev environment), pass through
  if (!secretKey || secretKey === "test-turnstile-secret-disabled") {
    return { success: true, bypassed: true };
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { success: false, error: "missing_turnstile_token" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (clientIp) formData.append("remoteip", clientIp);

    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return { success: false, error: "turnstile_verification_failed", status: res.status };
    }

    const outcome = await res.json();
    return { success: Boolean(outcome.success), error: outcome["error-codes"]?.[0] };
  } catch (err) {
    console.warn("Turnstile siteverify error:", err.message);
    // Allow graceful fallback if Cloudflare verification endpoint times out
    return { success: true, warning: "turnstile_timeout_fallback" };
  }
}
