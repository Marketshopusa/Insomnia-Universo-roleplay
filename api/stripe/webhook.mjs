import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "../config.mjs";
import { verifyStripeSignature, processStripeEvent } from "../security/stripeWebhook.mjs";

const send = (res, status, data) => res.status(status).json(data);

export const config = {
  api: {
    bodyParser: false, // Need raw body for HMAC-SHA256 signature verification
  },
};

/**
 * Stripe Webhook Handler (PCI-DSS SAQ A Compliant)
 * Cryptographically verifies stripe-signature and updates user credits idempotently.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured on the server.");
    return send(res, 503, { error: "stripe_webhook_unconfigured" });
  }

  // Read raw body stream
  let rawBody = "";
  try {
    if (typeof req.body === "string") {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf8");
    } else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      rawBody = Buffer.concat(chunks).toString("utf8");
    }
  } catch (err) {
    return send(res, 400, { error: "raw_body_read_failed", message: err.message });
  }

  // 1. Verify Cryptographic Signature
  const verification = verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!verification.valid) {
    console.warn("Stripe signature verification failed:", verification.error);
    return send(res, 400, { error: "invalid_stripe_signature", reason: verification.error });
  }

  // 2. Parse Event JSON
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return send(res, 400, { error: "invalid_json_payload" });
  }

  // 3. Connect to Supabase
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
  });

  // 4. Idempotency Check (Prevent replay attacks)
  try {
    const { data: existing } = await supabase
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (existing) {
      // Event has already been processed
      return send(res, 200, { received: true, deduplicated: true, eventId: event.id });
    }

    // Process event (credit addition / subscription tier update)
    const result = await processStripeEvent(supabase, event);

    // Record event in idempotency table
    await supabase.from("stripe_webhook_events").insert({
      id: event.id,
      event_type: event.type,
      customer_id: event.data?.object?.customer || null,
      user_id: result.userId || null,
      payload: event,
    });

    return send(res, 200, { received: true, ...result });
  } catch (err) {
    console.error("Stripe event processing error:", err.message);
    return send(res, 500, { error: "webhook_processing_failed", message: err.message });
  }
}
