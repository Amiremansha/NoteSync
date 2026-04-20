import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getAuthorizedUser } from "../_shared/auth.ts";
import { json } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type PushSubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type RequestPayload = {
  action?: "subscribe" | "unsubscribe";
  subscription?: PushSubscriptionPayload;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await getAuthorizedUser(req);
    const payload = (await req.json().catch(() => ({}))) as RequestPayload;
    const action = payload.action ?? "subscribe";
    const subscription = payload.subscription;
    const endpoint = subscription?.endpoint?.trim() ?? "";
    const admin = createAdminClient();

    if (!endpoint) {
      return json({ error: "subscription.endpoint is required." }, 400);
    }

    if (action === "unsubscribe") {
      const { error } = await admin
        .from("user_push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);

      if (error) {
        throw error;
      }

      return json({ ok: true, subscribed: false });
    }

    const p256dh = subscription?.keys?.p256dh?.trim() ?? "";
    const auth = subscription?.keys?.auth?.trim() ?? "";

    if (!p256dh || !auth) {
      return json({ error: "Push subscription keys are required." }, 400);
    }

    const { error } = await admin
      .from("user_push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get("user-agent") ?? "",
        },
        { onConflict: "user_id,endpoint" },
      );

    if (error) {
      throw error;
    }

    return json({ ok: true, subscribed: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});
