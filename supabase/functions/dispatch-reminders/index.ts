import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type DueNoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  label?: string | null;
  reminder_at: string | null;
  last_push_sent_for_reminder_at: string | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} secret.`);
  }

  return value;
};

const WEB_PUSH_SUBJECT = getRequiredEnv("WEB_PUSH_SUBJECT");
const WEB_PUSH_PUBLIC_KEY =
  Deno.env.get("WEB_PUSH_PUBLIC_KEY") || getRequiredEnv("VITE_WEB_PUSH_PUBLIC_KEY");
const WEB_PUSH_PRIVATE_KEY = getRequiredEnv("WEB_PUSH_PRIVATE_KEY");

webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);

const truncate = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
};

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: dueNotes, error: noteError } = await admin
      .from("notes")
      .select("id, user_id, title, content, label, reminder_at, last_push_sent_for_reminder_at")
      .not("reminder_at", "is", null)
      .eq("archived", false)
      .lte("reminder_at", nowIso)
      .returns<DueNoteRow[]>();

    if (noteError) {
      throw noteError;
    }

    const pendingNotes = (dueNotes ?? []).filter(
      (note) => note.reminder_at && note.last_push_sent_for_reminder_at !== note.reminder_at,
    );

    if (!pendingNotes.length) {
      return json({ processed: 0, sent: 0 });
    }

    const userIds = Array.from(new Set(pendingNotes.map((note) => note.user_id)));
    const { data: subscriptions, error: subscriptionError } = await admin
      .from("user_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds)
      .returns<PushSubscriptionRow[]>();

    if (subscriptionError) {
      throw subscriptionError;
    }

    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
    for (const subscription of subscriptions ?? []) {
      const existing = subscriptionsByUser.get(subscription.user_id) ?? [];
      existing.push(subscription);
      subscriptionsByUser.set(subscription.user_id, existing);
    }

    let sentCount = 0;

    for (const note of pendingNotes) {
      const noteSubscriptions = subscriptionsByUser.get(note.user_id) ?? [];
      const cleanLabel = (note.label || "").trim();
      const payload = JSON.stringify({
        title: cleanLabel
          ? `${note.title?.trim() || "NoteSync reminder"} — ${cleanLabel}`
          : note.title?.trim() || "NoteSync reminder",
        body: truncate(
          note.content?.trim() ||
            (cleanLabel ? `Label: ${cleanLabel}` : "Open NoteSync to view your reminder."),
          140,
        ),
        tag: `note-reminder-${note.id}`,
        data: {
          noteId: note.id,
          url: `/home?note=${note.id}`,
        },
      });

      for (const subscription of noteSubscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
          sentCount += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;

          if (statusCode === 404 || statusCode === 410) {
            await admin
              .from("user_push_subscriptions")
              .delete()
              .eq("id", subscription.id);
          }
        }
      }

      await admin
        .from("notes")
        .update({
          last_push_sent_for_reminder_at: note.reminder_at,
        })
        .eq("id", note.id)
        .eq("user_id", note.user_id);
    }

    return json({
      processed: dueNotes.length,
      pending: pendingNotes.length,
      sent: sentCount,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});
