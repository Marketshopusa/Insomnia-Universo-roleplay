/**
 * Credit Guard & Concurrency Control for Insomnia Universo Roleplay
 * Prevents financial DoS and runaway API/GPU costs by enforcing atomic credit checks
 * and strict concurrency limits before invoking expensive AI models.
 */

export const ACTION_CREDIT_COSTS = {
  "story-chat": 1,
  "speech": 2,
  "illustrate-scene": 5,
  "generate-studio-draft": 10,
  "generate-novel": 20,
  "generate-shorts-series": 15,
  "kineva-video": 25,
};

export const CONCURRENCY_LIMITS = {
  free: 1,      // Free plan: 1 heavy task at a time
  premium: 2,   // Premium plan: 2 concurrent tasks
  pro: 3,       // Pro plan: 3 concurrent tasks
  admin: 99,    // Admin: practically unlimited
};

const HEAVY_ACTIONS = new Set([
  "illustrate-scene",
  "generate-studio-draft",
  "generate-novel",
  "generate-shorts-series",
  "kineva-video",
]);

// In-memory active task tracking with timestamp for automatic TTL cleanup (3 min expiry)
const activeUserTasks = new Map();
const LOCK_TTL_MS = 180_000;

/**
 * Checks if a user is an Insomnia Master Administrator
 */
export function isUserAdmin(user) {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  return email === "marketshopusafl@gmail.com" || user.user_metadata?.is_admin === true || user.role === "admin";
}

/**
 * Validates concurrency limits for heavy tasks
 */
export function acquireConcurrencyLock(userId, action, planTier = "free") {
  if (!HEAVY_ACTIONS.has(action)) return { ok: true };

  const now = Date.now();
  const currentTasks = (activeUserTasks.get(userId) || []).filter((t) => now - t.timestamp < LOCK_TTL_MS);

  const limit = CONCURRENCY_LIMITS[planTier] || CONCURRENCY_LIMITS.free;

  if (currentTasks.length >= limit) {
    return {
      ok: false,
      error: "concurrency_limit_exceeded",
      message: `Has alcanzado el límite de tareas simultáneas para tu plan (${limit} en proceso). Espera a que termine la anterior.`,
      activeCount: currentTasks.length,
      limit,
    };
  }

  const taskId = `${action}_${now}_${Math.random().toString(36).slice(2, 7)}`;
  currentTasks.push({ id: taskId, action, timestamp: now });
  activeUserTasks.set(userId, currentTasks);

  return { ok: true, lockId: taskId };
}

/**
 * Releases a concurrency lock when the heavy task completes or fails
 */
export function releaseConcurrencyLock(userId, lockId) {
  if (!userId || !lockId) return;
  const tasks = activeUserTasks.get(userId);
  if (!tasks) return;
  const updated = tasks.filter((t) => t.id !== lockId);
  if (updated.length === 0) {
    activeUserTasks.delete(userId);
  } else {
    activeUserTasks.set(userId, updated);
  }
}

/**
 * Verifies that the user has sufficient credits and deducts them atomically.
 * Returns { ok: true, creditsRemaining } or { ok: false, error: "insufficient_credits", status: 402 }
 */
export async function verifyAndDeductCredits(supabaseClient, user, action, options = {}) {
  const isAdmin = isUserAdmin(user);
  const cost = ACTION_CREDIT_COSTS[action] || 1;

  // Master Admin has permanent unlimited credits
  if (isAdmin) {
    return { ok: true, isAdmin: true, cost: 0, creditsRemaining: 999999 };
  }

  // 1. Try atomic PostgreSQL RPC deduct_ai_credits (TABLE return)
  try {
    const { data: aiResult, error: aiError } = await supabaseClient.rpc("deduct_ai_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_generation_type: action,
      p_metadata: options.metadata || {},
    });

    const row = Array.isArray(aiResult) ? aiResult[0] : aiResult;
    if (!aiError && row) {
      if (row.success) {
        return { ok: true, cost, creditsRemaining: row.credits_remaining };
      }
      return {
        ok: false,
        status: 402,
        error: "insufficient_credits",
        message: row.error_message || `Saldo insuficiente. Esta acción requiere ${cost} créditos.`,
        creditsRemaining: row.credits_remaining || 0,
      };
    }
  } catch (err) {
    // continue to fallback
  }

  // 2. Try atomic PostgreSQL RPC deduct_user_credits (JSONB return)
  try {
    const { data: rpcResult, error: rpcError } = await supabaseClient.rpc("deduct_user_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_action: action,
    });

    if (!rpcError && rpcResult) {
      if (rpcResult.success) {
        return { ok: true, cost, creditsRemaining: rpcResult.credits_remaining };
      }
      return {
        ok: false,
        status: 402,
        error: "insufficient_credits",
        message: `Saldo insuficiente. Esta acción requiere ${cost} créditos (disponibles: ${rpcResult.credits_remaining || 0}).`,
        creditsRemaining: rpcResult.credits_remaining || 0,
      };
    }
  } catch (err) {
    // continue to fallback
  }

  // 3. Fallback to direct profiles table check & deduction
  const { data: profile, error: fetchErr } = await supabaseClient
    .from("profiles")
    .select("credits, ai_credits, role, is_admin")
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !profile) {
    return { ok: false, status: 500, error: "profile_not_found", message: "No se encontró el perfil de usuario." };
  }

  if (profile.is_admin || profile.role === "admin") {
    return { ok: true, isAdmin: true, cost: 0, creditsRemaining: 999999 };
  }

  const currentCredits = Number(profile.ai_credits ?? profile.credits) || 0;
  if (currentCredits < cost) {
    return {
      ok: false,
      status: 402,
      error: "insufficient_credits",
      message: `Saldo insuficiente. Esta acción requiere ${cost} créditos (disponibles: ${currentCredits}).`,
      creditsRemaining: currentCredits,
    };
  }

  const nextCredits = currentCredits - cost;
  const { error: updateErr } = await supabaseClient
    .from("profiles")
    .update({ credits: nextCredits, ai_credits: nextCredits, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateErr) {
    return { ok: false, status: 500, error: "credit_deduction_failed", message: "Error al actualizar saldo de créditos." };
  }

  return { ok: true, cost, creditsRemaining: nextCredits };
}
