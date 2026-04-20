import { createAdminClient } from "./supabase.ts";
import { encryptSecret, decryptSecret } from "./crypto.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} secret.`);
  return value;
};

const GOOGLE_CLIENT_ID = getRequiredEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = getRequiredEnv("GOOGLE_CLIENT_SECRET");

const getSupabaseUrl = () => {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) {
    throw new Error("Missing SUPABASE_URL secret. Set it in Supabase dashboard > Settings > Edge Functions");
  }
  return url;
};

export type GoogleConnection = {
  user_id: string;
  google_email: string;
  google_display_name: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  channel_id?: string | null;
  resource_id?: string | null;
  sync_token?: string | null;
  channel_expires_at?: string | null;
};

export const buildGoogleCalendarAuthUrl = (state: string, appUrl: string, redirectPath: string) => {
  const redirectUri = `${getSupabaseUrl()}/functions/v1/google-calendar-oauth-callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const exchangeGoogleCode = async (code: string) => {
  const redirect_uri = `${getSupabaseUrl()}/functions/v1/google-calendar-oauth-callback`;
  
  console.log("[Google OAuth] Exchanging code for tokens...");
  console.log("[Google OAuth] Request payload:", {
    code: code ? "***" : undefined,
    client_id: GOOGLE_CLIENT_ID ? "***" : undefined,
    client_secret: GOOGLE_CLIENT_SECRET ? "***" : undefined,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const responseText = await response.text();
  console.log("[Google OAuth] Token response status:", response.status);
  console.log("[Google OAuth] Token response body:", responseText);

  if (!response.ok) {
    let errorDetails = "";
    try {
      const errorJson = JSON.parse(responseText);
      errorDetails = errorJson.error_description || errorJson.error || responseText;
    } catch {
      errorDetails = responseText;
    }
    throw new Error(`Google token exchange failed (${response.status}): ${errorDetails}`);
  }

  const tokens = JSON.parse(responseText) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
    scope: string;
  };

  console.log("[Google OAuth] Token exchange successful, has refresh_token:", !!tokens.refresh_token);

  return tokens;
};

export const refreshGoogleAccessToken = async (refreshToken: string) => {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status})`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in?: number;
    token_type: string;
    scope: string;
  };
};

export const fetchGoogleUserProfile = async (accessToken: string) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user profile.");
  }

  return (await response.json()) as {
    email?: string;
    name?: string;
  };
};

export const getGoogleConnection = async (userId: string): Promise<GoogleConnection | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select(
      "user_id, google_email, google_display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, channel_id, resource_id, sync_token, channel_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as GoogleConnection | null;
};

export const saveGoogleConnection = async (userId: string, payload: Partial<GoogleConnection>) => {
  const supabase = createAdminClient();
  
  const accessTokenEncrypted =
    payload.access_token_encrypted === undefined
      ? undefined
      : payload.access_token_encrypted
        ? await encryptSecret(payload.access_token_encrypted)
        : "";

  const refreshTokenEncrypted =
    payload.refresh_token_encrypted === undefined
      ? undefined
      : payload.refresh_token_encrypted
        ? await encryptSecret(payload.refresh_token_encrypted)
        : "";

  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    google_email: payload.google_email ?? "",
    google_display_name: payload.google_display_name ?? "",
    token_expires_at: payload.token_expires_at ?? null,
    channel_id: payload.channel_id ?? null,
    resource_id: payload.resource_id ?? null,
    sync_token: payload.sync_token ?? null,
    channel_expires_at: payload.channel_expires_at ?? null,
  };

  if (accessTokenEncrypted !== undefined) {
    upsertPayload.access_token_encrypted = accessTokenEncrypted;
  }

  if (refreshTokenEncrypted !== undefined) {
    upsertPayload.refresh_token_encrypted = refreshTokenEncrypted;
  }

  const { error } = await supabase.from("google_calendar_connections").upsert(upsertPayload, {
    onConflict: "user_id",
  });

  if (error) throw error;
};

export const deleteGoogleConnection = async (userId: string) => {
  const supabase = createAdminClient();
  const { error } = await supabase.from("google_calendar_connections").delete().eq("user_id", userId);
  if (error) throw error;
};

export const callGoogleCalendar = async (
  accessToken: string,
  path: string,
  init: RequestInit & { retryOnUnauthorized?: boolean } = {},
) => {
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  return response;
};

export const getFreshGoogleAccessToken = async (connection: GoogleConnection) => {
  const now = Date.now();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;

  let accessToken = connection.access_token_encrypted;
  
  if (connection.access_token_encrypted) {
    try {
      accessToken = await decryptSecret(connection.access_token_encrypted);
    } catch {
      accessToken = connection.access_token_encrypted;
    }
  }

  if (expiresAt - now > 120000 && accessToken) {
    return accessToken;
  }

  let refreshToken = connection.refresh_token_encrypted;
  if (connection.refresh_token_encrypted) {
    try {
      refreshToken = await decryptSecret(connection.refresh_token_encrypted);
    } catch {
      refreshToken = connection.refresh_token_encrypted;
    }
  }

  if (!refreshToken) {
    throw new Error("Google Calendar connection expired. Please reconnect.");
  }

  const refreshed = await refreshGoogleAccessToken(refreshToken);
  const nextExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();

  await saveGoogleConnection(connection.user_id, {
    access_token_encrypted: refreshed.access_token,
    refresh_token_encrypted: refreshToken,
    token_expires_at: nextExpiresAt,
  });

  return refreshed.access_token;
};

const listCalendar = async (accessToken: string, params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const response = await callGoogleCalendar(accessToken, `/calendars/primary/events?${search.toString()}`, {
    method: "GET",
  });

  return response;
};

export const getInitialCalendarSyncToken = async (accessToken: string) => {
  let pageToken = "";
  let nextSyncToken = "";

  while (!nextSyncToken) {
    const response = await listCalendar(accessToken, {
      showDeleted: "true",
      singleEvents: "true",
      maxResults: 2500,
      pageToken,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch initial sync token: ${text}`);
    }

    const payload = await response.json() as { nextPageToken?: string; nextSyncToken?: string };
    nextSyncToken = payload.nextSyncToken ?? "";
    pageToken = payload.nextPageToken ?? "";

    if (!pageToken) break;
  }

  if (!nextSyncToken) {
    throw new Error("Unable to obtain Google Calendar sync token.");
  }

  return nextSyncToken;
};

export const listCalendarChanges = async (accessToken: string, syncToken: string) => {
  const response = await listCalendar(accessToken, {
    syncToken,
    showDeleted: "true",
    singleEvents: "true",
  });

  if (response.status === 410) {
    // Sync token expired or invalid; caller should reset.
    return { reset: true as const };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch calendar changes: ${text}`);
  }

  const payload = await response.json();
  return {
    reset: false as const,
    items: (payload.items ?? []) as Array<Record<string, unknown>>,
    nextSyncToken: payload.nextSyncToken as string,
  };
};

export const createCalendarWatchChannel = async (accessToken: string) => {
  const channelId = crypto.randomUUID();
  const address = `${getSupabaseUrl()}/functions/v1/google-calendar-webhook`;

  const response = await callGoogleCalendar(accessToken, "/calendars/primary/events/watch", {
    method: "POST",
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address,
      params: {
        ttl: 604800, // 7 days (max) - Google accepts integer seconds
      },
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to create watch channel: ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as { resourceId?: string; expiration?: string | number };
  const resourceId = data.resourceId ?? "";
  const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : null;

  return { channelId, resourceId, expiration };
};

export const bootstrapCalendarWatch = async (userId: string, accessToken: string) => {
  const syncToken = await getInitialCalendarSyncToken(accessToken);
  const { channelId, resourceId, expiration } = await createCalendarWatchChannel(accessToken);

  await saveGoogleConnection(userId, {
    sync_token: syncToken,
    channel_id: channelId,
    resource_id: resourceId,
    channel_expires_at: expiration,
  });

  return { syncToken, channelId, resourceId, expiration };
};
