import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { isPastReminder } from "../lib/calendar";

const NOTES_TABLE = "notes";
const SAVE_DEBOUNCE_MS = 1000;
const RETRY_DELAY_MS = 150;
const PAST_REMINDER_ERROR = "Reminders must be set in the future.";
const NOTE_SELECT_FULL_BASE = [
  "id",
  "user_id",
  "title",
  "content",
  "summary",
  "image_url",
  "image_path",
  "reminder_at",
  "tag_color",
  "archived",
  "updated_at",
  "google_event_id",
  "google_event_html_link",
  "google_sync_status",
  "google_sync_error",
  "google_synced_at",
];
const NOTE_SELECT_FALLBACK = "id, user_id, title, content, summary, updated_at";

const buildSelectColumns = (labelColumn) => {
  const columns = [...NOTE_SELECT_FULL_BASE];

  if (labelColumn) {
    const insertIndex = columns.indexOf("tag_color");
    columns.splice(insertIndex >= 0 ? insertIndex : columns.length, 0, labelColumn);
  }

  return columns.join(", ");
};

const normalizeNote = (note) => ({
  id: note.id,
  user_id: note.user_id,
  title: note.title ?? "",
  content: note.content ?? "",
  summary: note.summary ?? "",
  image_url: note.image_url ?? "",
  image_path: note.image_path ?? "",
  reminder_at: note.reminder_at ?? "",
  label: note.label ?? note.reminder_label ?? "",
  google_event_id: note.google_event_id ?? "",
  google_event_html_link: note.google_event_html_link ?? "",
  google_sync_status: note.google_sync_status ?? "idle",
  google_sync_error: note.google_sync_error ?? "",
  google_synced_at: note.google_synced_at ?? "",
  tag_color: note.tag_color ?? "",
  archived: Boolean(note.archived),
  created_at: note.created_at ?? note.inserted_at ?? note.updated_at ?? new Date().toISOString(),
  updated_at: note.updated_at ?? new Date().toISOString(),
});

// Keep ordering stable based on creation time so edits don't jump cards to the top.
const sortNotes = (items, orderMap) => {
  items.forEach((item) => {
    if (!orderMap.has(item.id)) {
      orderMap.set(item.id, orderMap.size);
    }
  });

  return [...items].sort((a, b) => {
    const orderA = orderMap.get(a.id) ?? 0;
    const orderB = orderMap.get(b.id) ?? 0;
    return orderA - orderB;
  });
};

const noteHasUnsavedChanges = (localNote, syncedNote) => {
  if (!localNote) {
    return false;
  }

  if (!syncedNote) {
    return true;
  }

  return (
    localNote.title !== syncedNote.title ||
    localNote.content !== syncedNote.content ||
    localNote.reminder_at !== syncedNote.reminder_at ||
    (localNote.label || "") !== (syncedNote.label || "") ||
    localNote.google_event_id !== syncedNote.google_event_id ||
    localNote.tag_color !== syncedNote.tag_color ||
    localNote.archived !== syncedNote.archived ||
    localNote.image_url !== syncedNote.image_url ||
    localNote.image_path !== syncedNote.image_path
  );
};

const createLocalId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const buildImagePath = (userId, noteId, extension = "jpg") => {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${userId}/${noteId}/${suffix}.${extension}`;
};

export default function useNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingById, setSavingById] = useState({});
  const [summarizingById, setSummarizingById] = useState({});

  const orderRef = useRef(new Map());
  const notesRef = useRef([]);
  const userIdRef = useRef(null);
  const realtimeChannelRef = useRef(null);
  const saveTimersRef = useRef(new Map());
  const inFlightSavesRef = useRef(new Map());
  const savePromisesRef = useRef(new Map());
  const syncedNotesRef = useRef(new Map());
  const deletingNoteIdsRef = useRef(new Set());
  const verifiedGoogleEventsRef = useRef(new Set());
  const labelColumnRef = useRef("label");

  const getFullSelectColumns = useCallback(
    () => buildSelectColumns(labelColumnRef.current),
    []
  );

  const setNotesState = useCallback((nextValue) => {
    setNotes((currentNotes) => {
      const nextNotes =
        typeof nextValue === "function" ? nextValue(currentNotes) : nextValue;

      notesRef.current = nextNotes;
      return nextNotes;
    });
  }, []);

  const setSaving = useCallback((noteId, value) => {
    setSavingById((current) => {
      if (value) {
        if (current[noteId]) {
          return current;
        }

        return { ...current, [noteId]: true };
      }

      if (!current[noteId]) {
        return current;
      }

      const next = { ...current };
      delete next[noteId];
      return next;
    });
  }, []);

  const setSummarizing = useCallback((noteId, value) => {
    setSummarizingById((current) => {
      if (value) {
        if (current[noteId]) {
          return current;
        }

        return { ...current, [noteId]: true };
      }

      if (!current[noteId]) {
        return current;
      }

      const next = { ...current };
      delete next[noteId];
      return next;
    });
  }, []);

  const clearSaveTimer = useCallback((noteId) => {
    const timerId = saveTimersRef.current.get(noteId);

    if (timerId) {
      clearTimeout(timerId);
      saveTimersRef.current.delete(noteId);
    }
  }, []);

  const clearAllSaveTimers = useCallback(() => {
    for (const timerId of saveTimersRef.current.values()) {
      clearTimeout(timerId);
    }

    saveTimersRef.current.clear();
  }, []);

  const rememberSyncedNotes = useCallback((nextNotes) => {
    syncedNotesRef.current = new Map(nextNotes.map((note) => [note.id, note]));
  }, []);

  const rememberSyncedNote = useCallback((note) => {
    syncedNotesRef.current.set(note.id, note);
  }, []);

  const syncGoogleCalendarEvent = useCallback(
    async (note) => {
      if (!note) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) return;

      const headers = {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "X-Authorization": `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      };

      const clearGoogleFields = async (updates = {}) => {
        const { data, error } = await supabase
          .from(NOTES_TABLE)
          .update({
            reminder_at: updates.reminder_at ?? (note.reminder_at || null),
            google_event_id: "",
            google_event_html_link: "",
            google_synced_at: null,
            google_sync_status: "idle",
            google_sync_error: "",
            ...(updates || {}),
          })
          .eq("id", note.id)
          .eq("user_id", note.user_id)
          .select(getFullSelectColumns())
          .single();

        if (!error && data) {
          const updated = normalizeNote(data);
          rememberSyncedNote(updated);
          setNotesState((currentNotes) =>
            sortNotes(
              currentNotes.map((currentNote) =>
                currentNote.id === updated.id ? updated : currentNote
              ),
              orderRef.current
            )
          );
        }
      };

      try {
        // If reminder is cleared, delete the existing calendar event and clear fields.
          if (!note.reminder_at) {
            if (note.google_event_id) {
              await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
                {
                method: "DELETE",
                headers,
                body: JSON.stringify({ eventId: note.google_event_id }),
                }
              ).catch(() => {});
            }

          await clearGoogleFields({ reminder_at: null });
          return;
        }

        const timeZone =
          typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "UTC";
        const reminderLabel = (note.label || "").trim();
        const startIso = note.reminder_at || null;
        const reminderEndAt = startIso && !Number.isNaN(new Date(startIso).getTime())
          ? new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString()
          : "";
        const eventTitle = [note.title || "Note reminder", reminderLabel].filter(Boolean).join(" — ");
        const eventDescription = note.content || "";

        // Update existing event
        if (note.google_event_id) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
            {
              method: "PUT",
              headers,
              body: JSON.stringify({
                eventId: note.google_event_id,
                title: eventTitle,
                description: eventDescription,
                label: reminderLabel,
                startTime: startIso,
                endTime: reminderEndAt,
                timeZone,
              }),
            }
          );

          if (response.status === 404) {
            // Event was removed in Google Calendar; clear reminder & linkage locally.
            await clearGoogleFields({ reminder_at: null, google_sync_error: "Google event removed" });
            return;
          }

          if (!response.ok) {
            return;
          }

          const payload = await response.json();
          const event = payload?.event || payload;
          const htmlLink = event?.htmlLink || note.google_event_html_link || "";

          const { data, error } = await supabase
            .from(NOTES_TABLE)
            .update({
              google_event_html_link: htmlLink,
              google_synced_at: new Date().toISOString(),
              google_sync_status: "synced",
              google_sync_error: "",
            })
            .eq("id", note.id)
            .eq("user_id", note.user_id)
            .select(getFullSelectColumns())
            .single();

          if (!error && data) {
            const updated = normalizeNote(data);
            rememberSyncedNote(updated);
            setNotesState((currentNotes) =>
              sortNotes(
                currentNotes.map((currentNote) =>
                  currentNote.id === updated.id ? updated : currentNote
                ),
                orderRef.current
              )
            );
          }

          return;
        }

        // Create new event
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              title: eventTitle,
              description: eventDescription,
              label: reminderLabel,
              startTime: startIso,
              endTime: reminderEndAt,
              timeZone,
            }),
          }
        );

        if (!response.ok) {
          // non-fatal: user may not have connected Google Calendar
          return;
        }

        const payload = await response.json();
        const event = payload?.event || payload;
        const eventId = event?.id || "";
        const htmlLink = event?.htmlLink || "";

        if (!eventId) return;

        const { data, error } = await supabase
          .from(NOTES_TABLE)
          .update({
            google_event_id: eventId,
            google_event_html_link: htmlLink,
          google_synced_at: new Date().toISOString(),
          google_sync_status: "synced",
          google_sync_error: "",
        })
        .eq("id", note.id)
        .eq("user_id", note.user_id)
        .select(getFullSelectColumns())
        .single();

        if (!error && data) {
          const updated = normalizeNote(data);
          rememberSyncedNote(updated);
          setNotesState((currentNotes) =>
            sortNotes(
              currentNotes.map((currentNote) =>
                currentNote.id === updated.id ? updated : currentNote
              ),
              orderRef.current
            )
          );
        }
      } catch (err) {
        console.warn("Google Calendar sync failed", err);
      }
    },
    [getFullSelectColumns, rememberSyncedNote, setNotesState]
  );

  const removeSyncedNote = useCallback((noteId) => {
    syncedNotesRef.current.delete(noteId);
  }, []);

  useEffect(() => {
    notes.forEach((note) => {
      if (note.google_event_id && !verifiedGoogleEventsRef.current.has(note.google_event_id)) {
        verifiedGoogleEventsRef.current.add(note.google_event_id);
        void syncGoogleCalendarEvent(note);
      }
    });
  }, [notes, syncGoogleCalendarEvent]);

  const uploadImageForNote = useCallback(async (noteId, file, previousPath = "") => {
    const userId = userIdRef.current;

    if (!userId) {
      throw new Error("You must be signed in to upload images.");
    }

    if (!file) {
      throw new Error("No image selected.");
    }

    const extension =
      (file.name && file.name.split(".").pop()?.toLowerCase()) || "jpg";
    const storagePath = buildImagePath(userId, noteId, extension);

    const { error: uploadError } = await supabase.storage
      .from("note-images")
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("note-images").getPublicUrl(storagePath);
    const publicUrl = data?.publicUrl ?? "";

    if (!publicUrl) {
      throw new Error("Unable to generate image URL.");
    }

    if (previousPath) {
      const { error: removeError } = await supabase.storage
        .from("note-images")
        .remove([previousPath]);

      if (removeError) {
        // Non-fatal: keep the new upload but surface the cleanup issue
        console.warn(removeError);
      }
    }

    return { publicUrl, storagePath };
  }, []);

  const removeImageForNote = useCallback(async (noteId, imagePath = "") => {
    if (!noteId) {
      throw new Error("Missing note id.");
    }

    if (!imagePath) {
      return true;
    }

    const { error: removeError } = await supabase.storage
      .from("note-images")
      .remove([imagePath]);

    if (removeError) {
      setError(removeError.message || "Failed to delete note image.");
      return false;
    }

    return true;
  }, []);

  const isNoteBusy = useCallback((noteId) => {
    return (
      saveTimersRef.current.has(noteId) || inFlightSavesRef.current.has(noteId)
    );
  }, []);

  const disconnectRealtime = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }, []);

  const fetchNotes = useCallback(
    async (explicitUserId) => {
      const userId = explicitUserId ?? userIdRef.current;

      if (!userId) {
        rememberSyncedNotes([]);
        setNotesState([]);
        setLoading(false);
        return [];
      }

      setLoading(true);
      setError(null);

      const runSelect = async (columns) =>
        supabase
          .from(NOTES_TABLE)
          .select(columns)
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
      let { data, error: fetchError } = await runSelect(getFullSelectColumns());
      let usedFallback = false;

      if (fetchError) {
        // Fallback for deployments where columns aren't migrated yet
        let message = (fetchError.message || "").toLowerCase();
        let missingColumn = fetchError.code === "42703";
        const triedLabelColumn = labelColumnRef.current;

        if (missingColumn && triedLabelColumn && message.includes(triedLabelColumn.toLowerCase())) {
          // Try legacy column name first, then disable labels if both fail.
          labelColumnRef.current = triedLabelColumn === "label" ? "reminder_label" : null;
          const retry = await runSelect(getFullSelectColumns());
          data = retry.data;
          fetchError = retry.error;
          message = (fetchError?.message || message).toLowerCase();
          missingColumn = fetchError?.code === "42703";
        }

        if (
          fetchError &&
          missingColumn &&
          labelColumnRef.current === "reminder_label" &&
          message.includes("reminder_label")
        ) {
          labelColumnRef.current = null;
          const retry = await runSelect(getFullSelectColumns());
          data = retry.data;
          fetchError = retry.error;
          message = (fetchError?.message || message).toLowerCase();
          missingColumn = fetchError?.code === "42703";
        }

        if (fetchError) {
          const shouldFallback =
            missingColumn ||
            message.includes("image_") ||
            message.includes("reminder") ||
            message.includes("google_") ||
            message.includes("archiv") ||
            message.includes("tag_");

          if (shouldFallback) {
            labelColumnRef.current = null;
            const retry = await runSelect(NOTE_SELECT_FALLBACK);
            data = retry.data;
            fetchError = retry.error;
            usedFallback = true;
          }
        }
      }

      if (fetchError) {
        setError(fetchError.message || "Failed to load notes.");
        setLoading(false);
        return [];
      }

      const nextNotes = sortNotes((data ?? []).map(normalizeNote), orderRef.current);

      rememberSyncedNotes(nextNotes);
      setNotesState(nextNotes);
      setLoading(false);

      if (usedFallback) {
        setError(
          "Some features (images, reminders, labels, calendar sync, archiving, tagging) are disabled until you run the latest migrations on your Supabase project."
        );
      }

      return nextNotes;
    },
    [rememberSyncedNotes, setNotesState]
  );

  const persistNote = useCallback(
    async (noteId) => {
      if (deletingNoteIdsRef.current.has(noteId)) {
        setSaving(noteId, false);
        return null;
      }

      const userId = userIdRef.current;

      if (!userId) {
        setError("You must be signed in to sync notes.");
        setSaving(noteId, false);
        return null;
      }

      if (inFlightSavesRef.current.has(noteId)) {
        return null;
      }

      const note = notesRef.current.find((currentNote) => currentNote.id === noteId);

      if (!note) {
        setSaving(noteId, false);
        return null;
      }

      const snapshot = {
        id: note.id,
        user_id: userId,
        title: note.title ?? "",
        content: note.content ?? "",
        image_url: note.image_url ?? "",
        image_path: note.image_path ?? "",
        reminder_at: note.reminder_at || null,
        google_event_id: note.reminder_at ? note.google_event_id ?? "" : "",
        google_event_html_link: note.reminder_at ? note.google_event_html_link ?? "" : "",
        google_sync_status: note.reminder_at ? note.google_sync_status ?? "idle" : "idle",
        google_sync_error: note.reminder_at ? note.google_sync_error ?? "" : "",
        google_synced_at: note.reminder_at ? note.google_synced_at || null : null,
        tag_color: note.tag_color ?? "",
        archived: Boolean(note.archived),
      };

      if (labelColumnRef.current) {
        snapshot[labelColumnRef.current] = note.reminder_at ? note.label ?? "" : "";
      }

      inFlightSavesRef.current.set(noteId, snapshot);
      setSaving(noteId, true);
      setError(null);

      const saveOperation = (async () => {
        try {
          const runUpsert = (columns, body) =>
            supabase
              .from(NOTES_TABLE)
              .upsert(body, { onConflict: "id" })
              .select(columns)
              .single();

          let { data, error: saveError } = await runUpsert(getFullSelectColumns(), snapshot);

          if (saveError) {
            let message = (saveError.message || "").toLowerCase();
            let missingColumn = saveError.code === "42703";

            if (
              missingColumn &&
              labelColumnRef.current &&
              message.includes(labelColumnRef.current.toLowerCase())
            ) {
              if (labelColumnRef.current === "label") {
                delete snapshot.label;
                labelColumnRef.current = "reminder_label";
                snapshot[labelColumnRef.current] = note.reminder_at ? note.label ?? "" : "";
              } else {
                delete snapshot[labelColumnRef.current];
                labelColumnRef.current = null;
              }

              const retry = await runUpsert(getFullSelectColumns(), snapshot);
              data = retry.data;
              saveError = retry.error;
              message = (saveError?.message || message).toLowerCase();
              missingColumn = saveError?.code === "42703";
            }

            if (
              saveError &&
              missingColumn &&
              labelColumnRef.current === "reminder_label" &&
              message.includes("reminder_label")
            ) {
              delete snapshot.reminder_label;
              labelColumnRef.current = null;
              const retry = await runUpsert(getFullSelectColumns(), snapshot);
              data = retry.data;
              saveError = retry.error;
              message = (saveError?.message || message).toLowerCase();
              missingColumn = saveError?.code === "42703";
            }

            const shouldFallback =
              saveError?.code === "42703" ||
              message.includes("image_") ||
              message.includes("reminder") ||
              message.includes("google_") ||
              message.includes("archiv") ||
              message.includes("tag_");

            if (saveError && shouldFallback) {
              const snapshotFallback = {
                id: snapshot.id,
                user_id: snapshot.user_id,
                title: snapshot.title,
                content: snapshot.content,
                summary: note.summary ?? "",
              };

              const retry = await runUpsert(NOTE_SELECT_FALLBACK, snapshotFallback);
              data = retry.data;
              saveError = retry.error;

              if (!saveError) {
                // Surface a soft warning so the user knows newer note fields are disabled.
                setError(
                  "Some note features (images, reminders, labels, calendar sync, archiving, tagging) are disabled until you run the latest Supabase migrations."
                );
              }
            }
          }

          if (saveError) {
            throw saveError;
          }

          const syncedNote = normalizeNote(data);
          const latestLocalNote = notesRef.current.find(
            (currentNote) => currentNote.id === noteId
          );
          const localChangedAfterSaveStarted =
            latestLocalNote &&
            (latestLocalNote.title !== snapshot.title ||
              latestLocalNote.content !== snapshot.content ||
              latestLocalNote.reminder_at !== snapshot.reminder_at);

          rememberSyncedNote(syncedNote);

          // Fire-and-forget: push reminder to Google Calendar when connected
          void syncGoogleCalendarEvent(syncedNote);

          if (
            !deletingNoteIdsRef.current.has(noteId) &&
            !localChangedAfterSaveStarted
          ) {
            setNotesState((currentNotes) =>
              sortNotes(
                currentNotes.map((currentNote) =>
                  currentNote.id === noteId ? syncedNote : currentNote
                ),
                orderRef.current
              )
            );
          }

          return syncedNote;
        } catch (saveError) {
          setError(saveError.message || "Failed to sync note.");
          return null;
        } finally {
          inFlightSavesRef.current.delete(noteId);
          savePromisesRef.current.delete(noteId);

          if (!saveTimersRef.current.has(noteId)) {
            setSaving(noteId, false);
          }
        }
      })();

      savePromisesRef.current.set(noteId, saveOperation);
      return saveOperation;
    },
    [rememberSyncedNote, setNotesState, setSaving, syncGoogleCalendarEvent]
  );

  const scheduleSave = useCallback(
    (noteId, delay = SAVE_DEBOUNCE_MS) => {
      clearSaveTimer(noteId);
      setSaving(noteId, true);

      const timerId = window.setTimeout(() => {
        saveTimersRef.current.delete(noteId);

        if (deletingNoteIdsRef.current.has(noteId)) {
          setSaving(noteId, false);
          return;
        }

        if (inFlightSavesRef.current.has(noteId)) {
          scheduleSave(noteId, RETRY_DELAY_MS);
          return;
        }

        void persistNote(noteId);
      }, delay);

      saveTimersRef.current.set(noteId, timerId);
    },
    [clearSaveTimer, persistNote, setSaving]
  );

  const flushNote = useCallback(
    async (noteId) => {
      clearSaveTimer(noteId);

      if (inFlightSavesRef.current.has(noteId)) {
        scheduleSave(noteId, RETRY_DELAY_MS);
        return null;
      }

      return persistNote(noteId);
    },
    [clearSaveTimer, persistNote, scheduleSave]
  );

  const flushAllNotes = useCallback(async () => {
    const noteIds = Array.from(
      new Set([
        ...saveTimersRef.current.keys(),
        ...inFlightSavesRef.current.keys(),
        ...Object.keys(savingById),
      ])
    );

    return Promise.all(noteIds.map((noteId) => flushNote(noteId)));
  }, [flushNote, savingById]);

  const updateNote = useCallback(
    (noteId, updates) => {
      let nextUpdates = updates ?? {};

      if ("reminder_at" in nextUpdates) {
        const reminderValue = nextUpdates.reminder_at;

        if (reminderValue) {
          if (isPastReminder(reminderValue)) {
            setError(PAST_REMINDER_ERROR);
            return null;
          }

          setError((currentError) =>
            currentError === PAST_REMINDER_ERROR ? null : currentError
          );
        } else {
          setError((currentError) =>
            currentError === PAST_REMINDER_ERROR ? null : currentError
          );
        }
      }

      if ("reminder_label" in nextUpdates && !("label" in nextUpdates)) {
        nextUpdates = { ...nextUpdates, label: nextUpdates.reminder_label };
        delete nextUpdates.reminder_label;
      }

      if (!labelColumnRef.current && "label" in nextUpdates) {
        const { label: _omitLabel, ...rest } = nextUpdates;
        nextUpdates = rest;
      }

      if ("reminder_at" in nextUpdates && nextUpdates.reminder_at === "") {
        nextUpdates = { ...nextUpdates, reminder_at: null };
      }

      let nextNote = null;

      setNotesState((currentNotes) =>
        sortNotes(
          currentNotes.map((currentNote) => {
            if (currentNote.id !== noteId) {
              return currentNote;
            }

            nextNote = normalizeNote({
              ...currentNote,
              ...nextUpdates,
              updated_at: new Date().toISOString(),
            });

            return nextNote;
          }),
          orderRef.current
        )
      );

      if (nextNote) {
        scheduleSave(noteId);
      }

      return nextNote;
    },
    [scheduleSave, setNotesState]
  );

  const archiveNote = useCallback(
    async (noteId, archived = true) => {
      const existingNote =
        notesRef.current.find((currentNote) => currentNote.id === noteId) ?? null;

      if (!existingNote) {
        setError("Note not found.");
        return false;
      }

      updateNote(noteId, { archived: Boolean(archived) });
      await flushNote(noteId);
      return true;
    },
    [flushNote, updateNote]
  );

  const createNote = useCallback(
    async (values = {}, options = {}) => {
      let userId = userIdRef.current;
      const { immediate = false } = options;

      if (!userId) {
        // Late-load the user id to avoid race if the hook hasn't finished init yet.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setError(userError.message || "You must be signed in to create notes.");
          return null;
        }

        if (!user?.id) {
          setError("You must be signed in to create notes.");
          return null;
        }

        userIdRef.current = user.id;
        userId = user.id;
      }

      if (values.reminder_at) {
        if (isPastReminder(values.reminder_at)) {
          setError(PAST_REMINDER_ERROR);
          return null;
        }

        setError((currentError) =>
          currentError === PAST_REMINDER_ERROR ? null : currentError
        );
      } else {
        setError((currentError) =>
          currentError === PAST_REMINDER_ERROR ? null : currentError
        );
      }

      const nextNote = normalizeNote({
        id: createLocalId(),
        user_id: userId,
        title: values.title ?? "",
        content: values.content ?? "",
        summary: values.summary ?? "",
        image_url: values.image_url ?? "",
        image_path: values.image_path ?? "",
        reminder_at: values.reminder_at ?? "",
        label: labelColumnRef.current ? values.label ?? values.reminder_label ?? "" : "",
        tag_color: values.tag_color ?? "",
        archived: Boolean(values.archived),
        updated_at: new Date().toISOString(),
      });

      setNotesState((currentNotes) => sortNotes([nextNote, ...currentNotes], orderRef.current));

      const imageFile = values.imageFile;

      if (imageFile) {
        try {
          const { publicUrl, storagePath } = await uploadImageForNote(nextNote.id, imageFile);
          updateNote(nextNote.id, { image_url: publicUrl, image_path: storagePath });
        } catch (uploadError) {
          setError(uploadError.message || "Failed to upload image.");
        }
      }

      if (immediate) {
        await flushNote(nextNote.id);
      } else {
        scheduleSave(nextNote.id);
      }

      return nextNote;
    },
    [flushNote, scheduleSave, setNotesState, uploadImageForNote, updateNote]
  );

  const summarizeNote = useCallback(
    async (noteId, prompt = "") => {
      const userId = userIdRef.current;
      const localNote =
        notesRef.current.find((currentNote) => currentNote.id === noteId) ?? null;

      if (!userId) {
        setError("You must be signed in to summarize notes.");
        return null;
      }

      if (!localNote) {
        setError("Note not found.");
        return null;
      }

      const noteContent = localNote.content.trim();

      if (!noteContent) {
        setError("Add some note content before summarizing.");
        return null;
      }

      setSummarizing(noteId, true);
      setError(null);

      try {
        if (!syncedNotesRef.current.has(noteId)) {
          clearSaveTimer(noteId);

          if (inFlightSavesRef.current.has(noteId)) {
            const inFlightSave = savePromisesRef.current.get(noteId);

            if (inFlightSave) {
              await inFlightSave;
            } else {
              await persistNote(noteId);
            }
          } else {
            await persistNote(noteId);
          }
        }

        if (!syncedNotesRef.current.has(noteId)) {
          throw new Error("Save the note before requesting a summary.");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;

        if (!accessToken) {
          throw new Error("Your session expired. Log in again and retry.");
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              "X-Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              note_content: noteContent,
              prompt: typeof prompt === "string" ? prompt.trim() : "",
            }),
          }
        );

        if (!response.ok) {
          let message = `Summarize request failed (${response.status}).`;

          try {
            const payload = await response.json();
            message =
              payload?.error ||
              payload?.message ||
              payload?.details ||
              message;
          } catch {
            const fallbackText = await response.text();
            if (fallbackText) {
              message = fallbackText;
            }
          }

          throw new Error(message);
        }

        const data = await response.json();
        const summary = typeof data?.summary === "string" ? data.summary.trim() : "";

        if (!summary) {
          throw new Error("No summary returned.");
        }

        const { data: updatedData, error: updateError } = await supabase
          .from(NOTES_TABLE)
          .update({ summary })
          .eq("id", noteId)
          .eq("user_id", userId)
          .select(getFullSelectColumns())
          .single();

        if (updateError) {
          throw updateError;
        }

        const updatedNote = normalizeNote(updatedData);

      rememberSyncedNote(updatedNote);
      setNotesState((currentNotes) =>
        sortNotes(
          currentNotes.map((currentNote) =>
            currentNote.id === noteId ? updatedNote : currentNote
          ),
          orderRef.current
        )
      );

        return updatedNote;
      } catch (summarizeError) {
        setError(summarizeError.message || "Failed to summarize note.");
        return null;
      } finally {
        setSummarizing(noteId, false);
      }
    },
    [clearSaveTimer, getFullSelectColumns, persistNote, rememberSyncedNote, setNotesState, setSummarizing]
  );

  const deleteNote = useCallback(
    async (noteId) => {
      const localNote =
        notesRef.current.find((currentNote) => currentNote.id === noteId) ?? null;
      const syncedNoteBeforeDelete = syncedNotesRef.current.get(noteId) ?? null;

      if (!localNote && !syncedNoteBeforeDelete) {
        return false;
      }

      const compareLocal =
        labelColumnRef.current || !localNote
          ? localNote
          : { ...localNote, label: "" };
      const compareSynced =
        labelColumnRef.current || !syncedNoteBeforeDelete
          ? syncedNoteBeforeDelete
          : { ...syncedNoteBeforeDelete, label: "" };

      const hadUnsavedChanges = noteHasUnsavedChanges(compareLocal, compareSynced);

      // Clean up Google Calendar event before deleting the note.
      if ((syncedNoteBeforeDelete ?? localNote)?.google_event_id) {
        await syncGoogleCalendarEvent({
          ...(syncedNoteBeforeDelete ?? localNote),
          reminder_at: null,
        });
      }

      clearSaveTimer(noteId);
      deletingNoteIdsRef.current.add(noteId);
      setError(null);
      setSaving(noteId, false);
      setSummarizing(noteId, false);
      setNotesState((currentNotes) =>
        currentNotes.filter((currentNote) => currentNote.id !== noteId)
      );

      const inFlightSave = savePromisesRef.current.get(noteId);

      if (inFlightSave) {
        try {
          await inFlightSave;
        } catch {
          // persistNote already records the error state
        }
      }

      const syncedNote =
        syncedNoteBeforeDelete ?? syncedNotesRef.current.get(noteId) ?? null;
      const imagePathToRemove = (syncedNote ?? localNote)?.image_path ?? "";

      if (!syncedNote) {
        deletingNoteIdsRef.current.delete(noteId);
        return true;
      }

      const userId = userIdRef.current;
      const noteToRestore = localNote ?? syncedNote;
      const restoreDeletedNote = () => {
        deletingNoteIdsRef.current.delete(noteId);
        setNotesState((currentNotes) =>
          sortNotes([
            noteToRestore,
            ...currentNotes.filter((currentNote) => currentNote.id !== noteId),
          ], orderRef.current)
        );

        if (hadUnsavedChanges) {
          scheduleSave(noteId);
        }
      };

      if (!userId) {
        restoreDeletedNote();

        setError("You must be signed in to delete notes.");
        return false;
      }

      if (imagePathToRemove) {
        const { error: storageDeleteError } = await supabase.storage
          .from("note-images")
          .remove([imagePathToRemove]);

        if (storageDeleteError) {
          setError(storageDeleteError.message || "Failed to delete note image.");
        }
      }

      const { error: deleteError } = await supabase
        .from(NOTES_TABLE)
        .delete()
        .eq("id", noteId)
        .eq("user_id", userId);

      if (deleteError) {
        restoreDeletedNote();

        setError(deleteError.message || "Failed to delete note.");
        return false;
      }

      removeSyncedNote(noteId);
      deletingNoteIdsRef.current.delete(noteId);
      return true;
    },
    [
      clearSaveTimer,
      removeSyncedNote,
      scheduleSave,
      setNotesState,
      setSaving,
      setSummarizing,
      syncGoogleCalendarEvent,
    ]
  );

  const revertNote = useCallback(
    async (noteId) => {
      clearSaveTimer(noteId);

      const syncedNote = syncedNotesRef.current.get(noteId);

      if (!syncedNote) {
        setNotesState((currentNotes) =>
          currentNotes.filter((currentNote) => currentNote.id !== noteId)
        );
        setSaving(noteId, false);
        return null;
      }

    setNotesState((currentNotes) =>
      sortNotes(
        currentNotes.map((currentNote) =>
          currentNote.id === noteId ? syncedNote : currentNote
        ),
        orderRef.current
      )
    );

      scheduleSave(noteId, 0);
      return syncedNote;
    },
    [clearSaveTimer, scheduleSave, setNotesState, setSaving]
  );

  const applyIncomingServerNote = useCallback(
    (rawNote) => {
      const incomingNote = normalizeNote(rawNote);
      rememberSyncedNote(incomingNote);

      if (deletingNoteIdsRef.current.has(incomingNote.id)) {
        return;
      }

      if (isNoteBusy(incomingNote.id)) {
        return;
      }

      setNotesState((currentNotes) => {
        const noteExists = currentNotes.some(
          (currentNote) => currentNote.id === incomingNote.id
        );

        if (!noteExists) {
          return sortNotes([incomingNote, ...currentNotes], orderRef.current);
        }

        return sortNotes(
          currentNotes.map((currentNote) =>
            currentNote.id === incomingNote.id ? incomingNote : currentNote
          ),
          orderRef.current
        );
      });
    },
    [isNoteBusy, rememberSyncedNote, setNotesState]
  );

  const applyIncomingDelete = useCallback(
    (noteId) => {
      deletingNoteIdsRef.current.delete(noteId);
      removeSyncedNote(noteId);

      if (isNoteBusy(noteId)) {
        return;
      }

      setNotesState((currentNotes) =>
        currentNotes.filter((currentNote) => currentNote.id !== noteId)
      );
      setSaving(noteId, false);
    },
    [isNoteBusy, removeSyncedNote, setNotesState, setSaving]
  );

  useEffect(() => {
    let isActive = true;

    const subscribeToRealtime = (userId) => {
      disconnectRealtime();

      if (!userId) {
        return;
      }

      realtimeChannelRef.current = supabase
        .channel(`notes:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: NOTES_TABLE,
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              applyIncomingDelete(payload.old.id);
              return;
            }

            if (payload.new) {
              applyIncomingServerNote(payload.new);
            }
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            setError("Realtime sync disconnected.");
          }
        });
    };

    const initialize = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!isActive) {
        return;
      }

      if (authError) {
        setError(authError.message || "Failed to get the current user.");
        setLoading(false);
        return;
      }

      userIdRef.current = user?.id ?? null;

      if (!user) {
        rememberSyncedNotes([]);
        setNotesState([]);
        setLoading(false);
        return;
      }

      await fetchNotes(user.id);

      if (!isActive) {
        return;
      }

      subscribeToRealtime(user.id);
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;

      userIdRef.current = nextUserId;
      clearAllSaveTimers();
      inFlightSavesRef.current.clear();
      savePromisesRef.current.clear();
      deletingNoteIdsRef.current.clear();
      setSavingById({});
      setSummarizingById({});

      if (!nextUserId) {
        disconnectRealtime();
        rememberSyncedNotes([]);
        setNotesState([]);
        setLoading(false);
        return;
      }

      void fetchNotes(nextUserId);
      subscribeToRealtime(nextUserId);
    });

    return () => {
      isActive = false;
      clearAllSaveTimers();
      disconnectRealtime();
      subscription.unsubscribe();
    };
  }, [
    applyIncomingDelete,
    applyIncomingServerNote,
    clearAllSaveTimers,
    disconnectRealtime,
    fetchNotes,
    rememberSyncedNotes,
    setNotesState,
  ]);

  const isSaving = useMemo(
    () => Object.keys(savingById).length > 0,
    [savingById]
  );

  return {
    notes,
    loading,
    error,
    isSaving,
    savingById,
    summarizingById,
    refreshNotes: fetchNotes,
    createNote,
    updateNote,
    summarizeNote,
    deleteNote,
    archiveNote,
    revertNote,
    flushNote,
    flushAllNotes,
    uploadImageForNote,
    removeImageForNote,
    clearError: () => setError(null),
  };
}
