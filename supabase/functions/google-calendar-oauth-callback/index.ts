import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { bootstrapCalendarWatch } from "../_shared/google.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("[Callback] Request received");
  console.log("[Callback] URL:", req.url);
  console.log("[Callback] Code present:", !!code);
  console.log("[Callback] State present:", !!state);

  if (error) {
    return json({ error: `Google auth error: ${error}` }, 400);
  }

  if (!code || !state) {
    return json({ error: "Missing code or state.", codePresent: !!code, statePresent: !!state }, 400);
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const GOOGLE_TOKEN_ENCRYPTION_KEY = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");

  console.log("[Callback] GOOGLE_CLIENT_ID set:", !!GOOGLE_CLIENT_ID);
  console.log("[Callback] GOOGLE_CLIENT_SECRET set:", !!GOOGLE_CLIENT_SECRET);
  console.log("[Callback] SUPABASE_URL:", SUPABASE_URL);
  console.log("[Callback] SERVICE_ROLE_KEY set:", !!SERVICE_ROLE_KEY);
  console.log("[Callback] GOOGLE_TOKEN_ENCRYPTION_KEY set:", !!GOOGLE_TOKEN_ENCRYPTION_KEY);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET secrets" }, 500);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Missing SUPABASE_URL or SERVICE_ROLE_KEY secrets" }, 500);
  }

  try {
    const { user_id, redirect_url } = JSON.parse(atob(state));
    console.log("[Callback] Parsed state, user_id:", user_id);

    if (!user_id || !redirect_url) {
      return json({ error: "Invalid state.", user_id, redirect_url }, 400);
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth-callback`;
    console.log("[Callback] Redirect URI:", redirectUri);

    const body = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    console.log("[Callback] Exchanging code for tokens...");
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const tokenResponseText = await tokenResponse.text();
    console.log("[Callback] Token response status:", tokenResponse.status);
    console.log("[Callback] Token response:", tokenResponseText);

    if (!tokenResponse.ok) {
      return json({ 
        error: "Google token exchange failed", 
        status: tokenResponse.status, 
        details: tokenResponseText 
      }, 500);
    }

    const tokens = JSON.parse(tokenResponseText);
    console.log("[Callback] Token exchange successful, has refresh_token:", !!tokens.refresh_token);

    const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const profile = await profileResponse.json();
    console.log("[Callback] User profile:", profile);

    if (!profile.email) {
      return json({ error: "Failed to get user email from Google" }, 500);
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let accessTokenEncrypted = tokens.access_token;
    let refreshTokenEncrypted = tokens.refresh_token || "";

    if (GOOGLE_TOKEN_ENCRYPTION_KEY) {
      const encoder = new TextEncoder();
      const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
      
      const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(GOOGLE_TOKEN_ENCRYPTION_KEY));
      const key = await crypto.subtle.importKey(
        "raw", 
        new Uint8Array(keyBytes), 
        "AES-GCM", 
        false, 
        ["encrypt"]
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(tokens.access_token),
      );
      accessTokenEncrypted = `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;

      if (tokens.refresh_token) {
        const iv2 = crypto.getRandomValues(new Uint8Array(12));
        const encrypted2 = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv2 },
          key,
          encoder.encode(tokens.refresh_token),
        );
        refreshTokenEncrypted = `${toBase64(iv2)}:${toBase64(new Uint8Array(encrypted2))}`;
      }
    }

    const { error: dbError } = await supabase
      .from("google_calendar_connections")
      .upsert(
      {
        user_id,
        google_email: profile.email || "",
        google_display_name: profile.name || "",
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id" },
    );

    if (dbError) {
      console.log("[Callback] Database error:", dbError);
      return json({ error: "Failed to save connection", details: dbError.message }, 500);
    }

    try {
      await bootstrapCalendarWatch(user_id, tokens.access_token);
    } catch (watchErr) {
      console.error("[Callback] Failed to start calendar watch", watchErr);
      // Non-fatal: user can reconnect to re-initiate.
    }

    console.log("[Callback] Connection saved successfully");

    const finalUrl = new URL(redirect_url);
    finalUrl.searchParams.set("google_calendar_success", "true");

    // Surface the connected account details to the client so the UI can
    // flip to the "connected" state immediately, even before it calls the
    // status endpoint. This avoids a confusing extra "Connect" prompt right
    // after a successful OAuth round-trip.
    if (profile.email) {
      finalUrl.searchParams.set("google_calendar_email", profile.email);
    }

    if (profile.name) {
      finalUrl.searchParams.set("google_calendar_name", profile.name);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: finalUrl.toString(),
      },
    });
  } catch (err) {
    console.error("[Callback] Full error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : "";
    return json({ 
      error: "Authentication failed.",
      details: errorMessage,
      stack: errorStack,
    }, 500);
  }
});
