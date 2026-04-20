import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getAuthorizedUser } from "../_shared/auth.ts";
import {
  getGoogleConnection,
  getFreshGoogleAccessToken,
  callGoogleCalendar,
  deleteGoogleConnection,
} from "../_shared/google.ts";

const DEFAULT_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_EVENT_DURATION_MINUTES = 60;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeDateTime = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const resolveTimeZone = (value?: string) => {
  const tz = (value || "").trim();
  return tz || DEFAULT_TIME_ZONE;
};

const buildEventText = (title: string, description: string, label?: string) => {
  const cleanLabel = (label || "").trim();
  const summary = [title || "Note reminder", cleanLabel].filter(Boolean).join(" — ");
  const details = description || "";
  return { summary, details };
};

const addMinutes = (iso: string, minutes: number) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + minutes * 60_000).toISOString();
};

const buildReminderOverrides = () => ({
  useDefault: false,
  overrides: [
    {
      method: "popup",
      minutes: 0,
    },
  ],
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let user;
  try {
    user = await getAuthorizedUser(req);
  } catch {
    return json({ error: "Unauthorized." }, 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || req.headers.get("action") || req.headers.get("x-action");

  const parseJsonBody = async () => {
    try {
      return await req.json();
    } catch {
      return {};
    }
  };

  if (req.method === "GET" && action === "status") {
    try {
      const connection = await getGoogleConnection(user.id);
      return json({
        connected: !!connection,
        email: connection?.google_email || null,
        displayName: connection?.google_display_name || null,
      });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  if (req.method === "DELETE") {
    try {
      let eventId =
        url.searchParams.get("eventId") ||
        url.searchParams.get("event_id") ||
        "";

      if (!eventId) {
        const payload = await parseJsonBody();
        if (typeof payload?.eventId === "string") eventId = payload.eventId;
        else if (typeof payload?.event_id === "string") eventId = payload.event_id;
      }

      if (eventId) {
        const connection = await getGoogleConnection(user.id);

        if (!connection) {
          return json({ error: "Google Calendar not connected. Please connect first." }, 400);
        }

        const accessToken = await getFreshGoogleAccessToken(connection);
        const response = await callGoogleCalendar(
          accessToken,
          `/calendars/primary/events/${eventId}`,
          { method: "DELETE" },
        );

        if (response.ok || response.status === 404) {
          return json({
            success: true,
            deleted: response.status !== 404,
            missing: response.status === 404,
          });
        }

        const errorText = await response.text();
        return json({ error: `Failed to delete event: ${errorText}` }, response.status);
      }

      await deleteGoogleConnection(user.id);
      return json({ success: true, disconnected: true });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const payload = await parseJsonBody();

    const eventId =
      asString(payload?.eventId) ||
      asString(payload?.event_id);

    const title = asString(payload?.title);
    const description = asString(payload?.description);
    const label = asString(payload?.label);

    const reminderAt =
      asString(payload?.reminder_at) ||
      asString(payload?.reminderAt) ||
      asString(payload?.startTime);

    const endTime = asString(payload?.endTime);
    const timeZone = resolveTimeZone(asString(payload?.timeZone));

    const normalizedStartTime = normalizeDateTime(reminderAt);
    const resolvedEndTime = endTime
      ? normalizeDateTime(endTime)
      : normalizedStartTime
        ? addMinutes(normalizedStartTime, DEFAULT_EVENT_DURATION_MINUTES)
        : "";

    if (!eventId) {
      return json({ error: "eventId is required for updates." }, 400);
    }

    if (!title && !normalizedStartTime) {
      return json({ error: "title or reminder_at is required to update an event." }, 400);
    }

    try {
      const connection = await getGoogleConnection(user.id);

      if (!connection) {
        return json({ error: "Google Calendar not connected. Please connect first." }, 400);
      }

      const accessToken = await getFreshGoogleAccessToken(connection);
      const { summary, details } = buildEventText(title, description, label);

      const eventData: Record<string, unknown> = {
        summary: summary || undefined,
        description: details || undefined,
        reminders: buildReminderOverrides(),
      };

      if (normalizedStartTime) {
        eventData.start = {
          dateTime: normalizedStartTime,
          timeZone,
        };
      }

      if (resolvedEndTime) {
        eventData.end = {
          dateTime: resolvedEndTime,
          timeZone,
        };
      }

      const response = await callGoogleCalendar(accessToken, `/calendars/primary/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify(eventData),
      });

      if (response.status === 404) {
        return json({ error: "Google Calendar event not found.", notFound: true }, 404);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return json({ error: `Failed to update event: ${errorText}` }, response.status);
      }

      const event = await response.json();
      return json({ success: true, event });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  if (req.method === "POST") {
    let payload: Record<string, unknown>;

    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const title = asString(payload?.title);
    const description = asString(payload?.description);
    const label = asString(payload?.label);

    const reminderAt =
      asString(payload?.reminder_at) ||
      asString(payload?.reminderAt) ||
      asString(payload?.startTime);

    const endTime = asString(payload?.endTime);
    const timeZone = resolveTimeZone(asString(payload?.timeZone));

    const normalizedStartTime = normalizeDateTime(reminderAt);
    const resolvedEndTime = endTime
      ? normalizeDateTime(endTime)
      : normalizedStartTime
        ? addMinutes(normalizedStartTime, DEFAULT_EVENT_DURATION_MINUTES)
        : "";

    if (!title || !normalizedStartTime) {
      return json({ error: "title and reminder_at are required." }, 400);
    }

    try {
      const connection = await getGoogleConnection(user.id);

      if (!connection) {
        return json({ error: "Google Calendar not connected. Please connect first." }, 400);
      }

      const accessToken = await getFreshGoogleAccessToken(connection);
      const { summary, details } = buildEventText(title, description, label);

      const eventData: Record<string, unknown> = {
        summary,
        description: details || undefined,
        reminders: buildReminderOverrides(),
        start: {
          dateTime: normalizedStartTime,
          timeZone,
        },
        end: {
          dateTime: resolvedEndTime || addMinutes(normalizedStartTime, DEFAULT_EVENT_DURATION_MINUTES),
          timeZone,
        },
      };

      const response = await callGoogleCalendar(accessToken, "/calendars/primary/events", {
        method: "POST",
        body: JSON.stringify(eventData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return json({ error: `Failed to create event: ${errorText}` }, response.status);
      }

      const event = await response.json();
      return json({ success: true, event });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
});