import crypto from "node:crypto";

/**
 * Stripe Cryptographic Signature Verifier (PCI-DSS SAQ A Compliant)
 * Verifies webhook signatures using native Node.js HMAC-SHA256 without external dependencies.
 */
export function verifyStripeSignature(rawPayload, signatureHeader, secret, toleranceSeconds = 300) {
  if (!rawPayload || !signatureHeader || !secret) {
    return { valid: false, error: "missing_signature_parameters" };
  }

  try {
    const parts = signatureHeader.split(",").reduce((acc, part) => {
      const [key, value] = part.trim().split("=");
      if (key && value) acc[key] = value;
      return acc;
    }, {});

    const timestamp = Number(parts.t);
    const expectedSignature = parts.v1;

    if (!timestamp || !expectedSignature) {
      return { valid: false, error: "invalid_signature_format" };
    }

    // Check tolerance (default 5 minutes) to protect against replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return { valid: false, error: "timestamp_out_of_tolerance" };
    }

    // Compute expected HMAC-SHA256
    const signedPayload = `${timestamp}.${rawPayload}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(signedPayload, "utf8");
    const computedSignature = hmac.digest("hex");

    // Timing-safe comparison to prevent timing attacks
    const bufferComputed = Buffer.from(computedSignature, "hex");
    const bufferExpected = Buffer.from(expectedSignature, "hex");

    if (bufferComputed.length !== bufferExpected.length) {
      return { valid: false, error: "signature_mismatch" };
    }

    const isValid = crypto.timingSafeEqual(bufferComputed, bufferExpected);
    return { valid: isValid, timestamp };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Plan credit bundles for Stripe subscriptions/payments
 */
export const STRIPE_PLAN_CREDITS = {
  premium: { credits: 1000, planTier: "premium" },
  pro: { credits: 3000, planTier: "pro" },
  topup_small: { credits: 500, planTier: null },
  topup_large: { credits: 2500, planTier: null },
};

/**
 * Handles verified Stripe webhook events (checkout.session.completed, customer.subscription.updated)
 */
export async function processStripeEvent(supabaseClient, event) {
  if (!event || !event.type) throw new Error("Evento de Stripe inválido.");

  const eventType = event.type;
  const dataObject = event.data?.object;

  if (eventType === "checkout.session.completed" || eventType === "invoice.payment_succeeded") {
    const customerEmail = dataObject.customer_email || dataObject.customer_details?.email;
    const clientReferenceId = dataObject.client_reference_id; // Supabase user_id
    const planKey = dataObject.metadata?.plan_key || "premium";

    const planConfig = STRIPE_PLAN_CREDITS[planKey] || STRIPE_PLAN_CREDITS.premium;

    // Locate profile by user_id or email
    let query = supabaseClient.from("profiles").select("id, user_id, credits, role");
    if (clientReferenceId) {
      query = query.eq("user_id", clientReferenceId);
    } else if (customerEmail) {
      // Find user by email
      const { data: userRecord } = await supabaseClient
        .from("auth.users")
        .select("id")
        .eq("email", customerEmail)
        .maybeSingle();
      if (userRecord) query = query.eq("user_id", userRecord.id);
    }

    const { data: profile, error } = await query.maybeSingle();
    if (error || !profile) {
      console.warn("Stripe webhook: No se encontró perfil para", clientReferenceId || customerEmail);
      return { processed: false, reason: "profile_not_found" };
    }

    const newCredits = (profile.credits || 0) + planConfig.credits;
    const updatePayload = {
      credits: newCredits,
      updated_at: new Date().toISOString(),
    };
    if (planConfig.planTier) {
      updatePayload.role = planConfig.planTier;
    }

    await supabaseClient.from("profiles").update(updatePayload).eq("id", profile.id);

    return { processed: true, userId: profile.user_id, addedCredits: planConfig.credits, newCredits };
  }

  return { processed: true, ignored: true, eventType };
}
