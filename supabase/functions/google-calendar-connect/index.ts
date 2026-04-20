import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getAuthorizedUser } from "../_shared/auth.ts";
import { buildGoogleCalendarAuthUrl } from "../_shared/google.ts";

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    let user;
    try {
      user = await getAuthorizedUser(req);
    } catch {
      return json({ error: "Unauthorized." }, 401);
    }

    let payload: { redirect_url?: unknown };

    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const redirectUrl = typeof payload.redirect_url === "string" 
      ? payload.redirect_url 
      : req.headers.get("Referer") || "http://127.0.0.1:3000";

    const state = JSON.stringify({
      user_id: user.id,
      redirect_url: redirectUrl,
    });

    const authUrl = buildGoogleCalendarAuthUrl(
      btoa(state),
      redirectUrl,
      "/google-calendar-oauth-callback"
    );

    return json({ auth_url: authUrl });
  } catch (err) {
    console.error("[google-calendar-connect] Unexpected error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
