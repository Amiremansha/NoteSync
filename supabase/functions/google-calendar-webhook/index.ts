/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient } from "../_shared/supabase.ts";
import {
  getFreshGoogleAccessToken,
  listCalendarChanges,
  getInitialCalendarSyncToken,
  createCalendarWatchChannel,
  saveGoogleConnection,
} from "../_shared/google.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Google sends POST notifications.
  const channelId = req.headers.get("x-goog-channel-id") ?? "";
  const resourceId = req.headers.get("x-goog-resource-id") ?? "";
  const resourceState = req.headers.get("x-goog-resource-state") ?? "";
  const channelExpiration = req.headers.get("x-goog-channel-expiration") ?? "";

  if (!channelId || !resourceId) {
    return json({ error: "Missing channel headers." }, 400);
  }

  try {
    const admin = createAdminClient();
    let connectionRow: any = null;

    try {
      const { data, error } = await admin
        .from("google_calendar_connections")
        .select(
          "user_id, channel_id, resource_id, sync_token, channel_expires_at, access_token_encrypted, refresh_token_encrypted, token_expires_at",
        )
        .eq("channel_id", channelId)
        .eq("resource_id", resourceId)
        .maybeSingle();

      if (error) throw error;
      connectionRow = data;
    } catch (err: any) {
      // Handle deployments that have not run the migration yet.
      if (typeof err?.code === "string" && err.code === "42703") {
        return json({
          error: "Google watch columns missing. Run migrations (sync_token/channel_id/resource_id).",
        }, 200);
      }

      throw err;
    }

    if (!connectionRow) {
      return json({ error: "Channel not found." }, 404);
    }

    const connection = connectionRow as any;
    const accessToken = await getFreshGoogleAccessToken(connection);

    // Initial sync or reset if we don't have a sync token.
    const ensureFreshWatch = async () => {
      const syncToken = await getInitialCalendarSyncToken(accessToken);
      const { channelId: nextChannelId, resourceId: nextResourceId, expiration } =
        await createCalendarWatchChannel(accessToken);

      await saveGoogleConnection(connection.user_id, {
        sync_token: syncToken,
        channel_id: nextChannelId,
        resource_id: nextResourceId,
        channel_expires_at: (expiration ?? channelExpiration) || null,
      });
    };

    let syncToken = connection.sync_token as string | null;

    if (!syncToken) {
      await ensureFreshWatch();
      return json({ ok: true, reset: true });
    }

    const maybeExpiresAt = channelExpiration || connection.channel_expires_at || null;
    const expiresSoon =
      maybeExpiresAt && Date.parse(String(maybeExpiresAt)) - Date.now() < 24 * 60 * 60 * 1000;

    let changes;
    try {
      changes = await listCalendarChanges(accessToken, syncToken);
    } catch (err: any) {
      // If Google says invalid sync token, reset the watch.
      if (typeof err?.message === "string" && err.message.includes("410")) {
        await ensureFreshWatch();
        return json({ ok: true, reset: true });
      }

      throw err;
    }

    if (changes.reset) {
      await ensureFreshWatch();
      return json({ ok: true, reset: true });
    }

    const items = changes.items ?? [];
    const cancelledIds = items
      .filter((item) => item?.status === "cancelled" && typeof item?.id === "string")
      .map((item) => (item as { id: string }).id);

    const updatedItems = items
      .filter((item) => item?.status !== "cancelled" && typeof item?.id === "string")
      .map((item) => item as { id: string; summary?: string; description?: string; start?: any; end?: any });

    if (cancelledIds.length) {
      await admin
        .from("notes")
        .update({
          reminder_at: null,
          google_event_id: "",
          google_event_html_link: "",
          google_synced_at: null,
          google_sync_status: "idle",
          google_sync_error: "Deleted in Google Calendar",
        })
        .in("google_event_id", cancelledIds)
        .eq("user_id", connection.user_id);
    }

    if (updatedItems.length) {
      for (const item of updatedItems) {
        const start = item.start?.dateTime || item.start?.date || null;
        await admin
          .from("notes")
          .update({
            title: item.summary ?? undefined,
            content: item.description ?? undefined,
            reminder_at: start,
            google_event_id: item.id,
            google_event_html_link: undefined,
            google_synced_at: new Date().toISOString(),
            google_sync_status: "synced",
            google_sync_error: "",
          })
          .eq("google_event_id", item.id)
          .eq("user_id", connection.user_id);
      }
    }

    const nextSyncToken = changes.nextSyncToken ?? null;

    await saveGoogleConnection(connection.user_id, {
      sync_token: nextSyncToken ?? syncToken,
      channel_expires_at: channelExpiration || connection.channel_expires_at || null,
    });

    if (expiresSoon) {
      try {
        const { channelId: nextChannelId, resourceId: nextResourceId, expiration } =
          await createCalendarWatchChannel(accessToken);
        await saveGoogleConnection(connection.user_id, {
          channel_id: nextChannelId,
          resource_id: nextResourceId,
          channel_expires_at: expiration,
        });
      } catch {
        // best-effort; will re-init on next callback or reconnect
      }
    }

    return json({ ok: true, cancelled: cancelledIds.length, state: resourceState });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
};

Deno.serve(handler);
