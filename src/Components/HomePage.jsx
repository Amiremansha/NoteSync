import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { applyTheme, getInitialTheme } from "../theme";
import useNotes from "../hooks/useNotes";
import {
  isPushSupported,
  syncPushSubscription,
} from "../lib/pushNotifications";
import headerLogo from "../assets/logo.svg";
import quickActionIcon from "../assets/quick action.svg";
import Card from "./Card.jsx";
import FeatureBox from "./FeatureBox.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import "./HomePage.css";
import "./Mobile_Opt/HomePageMobile.css";
import FloatingCreate from "./FloatingCreate.jsx";

const pickFirstNonEmpty = (...values) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || "";

const getEmailLocalPart = (email) => {
  if (typeof email !== "string") return "";
  return email.split("@")[0]?.trim() || "";
};

const getIdentityDataByProvider = (user, providerName) => {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const target = identities.find((identity) => identity?.provider === providerName);
  return target?.identity_data ?? {};
};

const getUserDisplayName = (user) => {
  if (!user) return "";

  const metadata = user.user_metadata ?? {};
  const googleIdentity = getIdentityDataByProvider(user, "google");

  return pickFirstNonEmpty(
    googleIdentity.full_name,
    googleIdentity.name,
    metadata.full_name,
    metadata.name,
    getEmailLocalPart(googleIdentity.email),
    getEmailLocalPart(user.email),
    metadata.display_name,
    metadata.preferred_username
  );
};

const getUserAvatarUrl = (user) => {
  if (!user) return "";

  const metadata = user.user_metadata ?? {};
  const googleIdentity = getIdentityDataByProvider(user, "google");

  return pickFirstNonEmpty(
    googleIdentity.avatar_url,
    googleIdentity.picture,
    metadata.avatar_url,
    metadata.picture
  );
};


export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileQuickActionsOpen, setMobileQuickActionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof document === "undefined") return false;
    return Boolean(document.fullscreenElement);
  });
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeTag, setActiveTag] = useState("");
  const [notificationsState, setNotificationsState] = useState({
    supported: isPushSupported(),
    configured: Boolean(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim()),
    subscribed: false,
    permission:
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "default",
    syncing: false,
  });
  const [googleCalendarState, setGoogleCalendarState] = useState({
    connected: false,
    email: null,
    loading: false,
  });
  const [integrationNotice, setIntegrationNotice] = useState("");
  const pageRef = useRef(null);
  const topbarRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "dark" || attr === "light") return attr === "dark";
    }
    return getInitialTheme() === "dark";
  });

  const navigate = useNavigate();
  const location = useLocation();
  const {
    notes,
    loading,
    error,
    savingById,
    summarizingById,
    createNote,
    updateNote,
    summarizeNote,
    deleteNote,
    revertNote,
    flushNote,
    uploadImageForNote,
    removeImageForNote,
    archiveNote,
  } = useNotes();

  const getFreshAccessToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;

    if (error || !session?.access_token) return null;

    const expiryMs = session.expires_at ? session.expires_at * 1000 : 0;
    const isExpiringSoon = expiryMs && expiryMs - Date.now() < 120000;

    if (!isExpiringSoon) {
      return session.access_token;
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token || session.access_token;
  }, []);

  const ensurePushNotifications = useCallback(
    async ({ forcePermissionPrompt = false } = {}) => {
      setNotificationsState((current) => ({ ...current, syncing: true }));

      try {
        const payload = await syncPushSubscription({ forcePermissionPrompt });
        setNotificationsState((current) => ({
          ...current,
          ...payload,
          syncing: false,
          permission: payload?.permission ?? current.permission,
        }));

        if (forcePermissionPrompt && payload?.permission === "denied") {
          setIntegrationNotice("Browser notifications are blocked for NoteSync.");
        }
      } catch (notificationError) {
        setNotificationsState((current) => ({ ...current, syncing: false }));
        setIntegrationNotice(
          notificationError.message || "Unable to enable reminder notifications."
        );
      }
    },
    []
  );

  const checkGoogleCalendarStatus = useCallback(async () => {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setIntegrationNotice("Session expired or invalid. Please sign in again.");
      return;
    }

    setGoogleCalendarState((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events?action=status`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "X-Authorization": `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      if (!response.ok) {
        const text = await response.text();
        console.error("Google Calendar status check failed", { status: response.status, body: text });
        setGoogleCalendarState((current) => ({ ...current, loading: false }));
        return;
      }

      const data = await response.json();
      setGoogleCalendarState({
        connected: data?.connected ?? false,
        email: data?.email ?? null,
        loading: false,
      });
    } catch (err) {
      console.error("Google Calendar status check failed", err);
      setGoogleCalendarState((current) => ({ ...current, loading: false }));
    }
  }, [getFreshAccessToken]);

  const connectGoogleCalendar = useCallback(async () => {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setIntegrationNotice("Session expired or invalid. Please sign in again.");
      return;
    }

    setGoogleCalendarState((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-connect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "X-Authorization": `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            redirect_url: window.location.href,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data?.auth_url) {
          window.location.href = data.auth_url;
        } else {
          setIntegrationNotice("Failed to start Google Calendar connection (no auth URL).");
          setGoogleCalendarState((current) => ({ ...current, loading: false }));
        }
        return;
      }

      if (response.status === 401) {
        // Session likely stale; try refresh once then retry.
        const { data: refreshed } = await supabase.auth.refreshSession();
        const retryToken = refreshed?.session?.access_token;

        if (retryToken) {
          const retry = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-connect`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                "X-Authorization": `Bearer ${retryToken}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                redirect_url: window.location.href,
              }),
            }
          );

          if (retry.ok) {
            const retryData = await retry.json();
            if (retryData?.auth_url) {
              window.location.href = retryData.auth_url;
              return;
            }
          }
        }

        // If refresh + retry still failed, surface the error without logging the user out.
        setIntegrationNotice("Session expired or invalid. Please refresh and try again.");
        setGoogleCalendarState((current) => ({ ...current, loading: false }));
        return;
      }

      const errorText = await response.text();
      let message = "Failed to connect Google Calendar";
      try {
        const parsed = JSON.parse(errorText);
        message = parsed?.error || message;
      } catch {
        if (errorText) message = errorText;
      }

      console.error("Google Calendar connect failed", { status: response.status, body: errorText });
      setIntegrationNotice(message);
      setGoogleCalendarState((current) => ({ ...current, loading: false }));
    } catch (err) {
      console.error("Google Calendar connect failed", err);
      setIntegrationNotice(err?.message || "Failed to connect Google Calendar");
      setGoogleCalendarState((current) => ({ ...current, loading: false }));
    }
  }, [getFreshAccessToken]);

  const disconnectGoogleCalendar = useCallback(async () => {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) return;

    setGoogleCalendarState((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "X-Authorization": `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      if (response.ok) {
        setGoogleCalendarState({
          connected: false,
          email: null,
          loading: false,
        });
        return;
      }

      const text = await response.text();
      console.error("Google Calendar disconnect failed", { status: response.status, body: text });
      setIntegrationNotice("Failed to disconnect Google Calendar");
      setGoogleCalendarState((current) => ({ ...current, loading: false }));
    } catch (err) {
      console.error("Google Calendar disconnect failed", err);
      setGoogleCalendarState((current) => ({ ...current, loading: false }));
    }
  }, [getFreshAccessToken]);

  useEffect(() => {
    let isMounted = true;

    const applyAuthenticatedUser = async (user, options = {}) => {
      const { syncIntegrations = false } = options;
      if (!isMounted || !user) return;

      setUsername(getUserDisplayName(user));
      setAvatarUrl(getUserAvatarUrl(user));

      if (syncIntegrations) {
        await ensurePushNotifications();
        await checkGoogleCalendarStatus();
      }
    };

    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await applyAuthenticatedUser(user, { syncIntegrations: true });
      } else {
        navigate("/");
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      if (session?.user) {
        void applyAuthenticatedUser(session.user);
      } else {
        navigate("/");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [ensurePushNotifications, checkGoogleCalendarStatus, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.delete("calendar");

    const googleEmail = params.get("google_calendar_email");
    const googleName = params.get("google_calendar_name");

    if (params.get("google_calendar_success") === "true") {
      params.delete("google_calendar_success");
      params.delete("google_calendar_email");
      params.delete("google_calendar_name");

      // Optimistically flip UI to connected after OAuth redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGoogleCalendarState((current) => ({
        ...current,
        connected: true,
        email: googleEmail || googleName || current.email,
        loading: true,
      }));

      void checkGoogleCalendarStatus();
    } else {
      // Clean up any stray params if we landed here without a success flag.
      params.delete("google_calendar_email");
      params.delete("google_calendar_name");
    }

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate, checkGoogleCalendarStatus]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  useEffect(() => {
    const syncTheme = (e) => {
      if (e?.detail === "dark" || e?.detail === "light") {
        setIsDarkTheme(e.detail === "dark");
      }
    };
    window.addEventListener("notesync-theme-change", syncTheme);
    return () => window.removeEventListener("notesync-theme-change", syncTheme);
  }, []);

  const displayName = username || "User";
  const initial = displayName.charAt(0).toUpperCase();
  const notificationSummary = !notificationsState.supported
    ? "Not supported"
    : notificationsState.permission === "granted" && notificationsState.subscribed
    ? "Enabled"
    : notificationsState.permission === "denied"
    ? "Blocked"
    : notificationsState.configured
    ? "Not enabled"
    : "Missing key";

  const filteredNotes = useMemo(() => {
    let base;

    if (activeFilter === "archived") {
      base = notes.filter((note) => note.archived);
    } else if (activeFilter === "reminders") {
      base = notes
        .filter((note) => !note.archived && Boolean(note.reminder_at))
        .sort((a, b) => new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime());
    } else {
      base = notes.filter((note) => !note.archived);
    }

    if (activeTag) {
      base = base.filter((note) => (note.tag_color || "").toLowerCase() === activeTag);
    }

    return base;
  }, [activeFilter, activeTag, notes]);

  const handleCreateNote = async ({ reminderAt, header, body, imageFile }) => {
    const parsedReminder = reminderAt ? new Date(reminderAt) : null;
    const nextReminderAt =
      parsedReminder && !Number.isNaN(parsedReminder.getTime())
        ? parsedReminder.toISOString()
        : "";

    const created = await createNote(
      {
        title: header,
        content: body,
        reminder_at: nextReminderAt,
        imageFile,
      },
      { immediate: true }
    );

    if (created && nextReminderAt) {
      setActiveFilter("reminders");
      setActiveTag("");
      void ensurePushNotifications({ forcePermissionPrompt: true });
    }
  };

  const handleReminderAssigned = () => {
    setActiveFilter("reminders");
    setActiveTag("");
    void ensurePushNotifications({ forcePermissionPrompt: true });
  };

  const focusedNoteId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("note") || "";
  }, [location.search]);


  useEffect(() => {
    if (!focusedNoteId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setActiveFilter("all");
      setActiveTag("");
      setSearchTerm("");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusedNoteId]);

  const getCurrentTheme = () => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return getInitialTheme();
  };

  const handleToggleTheme = () => {
    const current = getCurrentTheme();
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    setIsDarkTheme(next === "dark");
  };

  const handleToggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen toggle failed", err);
    }
  };

  useEffect(() => {
    if (!mobileSearchOpen) return;
    mobileSearchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!integrationNotice) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setIntegrationNotice("");
    }, 5000);

    return () => window.clearTimeout(timerId);
  }, [integrationNotice]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 860) {
        setMobileSearchOpen(false);
        setMobileQuickActionsOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    let rafId = 0;

    const updateStripTop = () => {
      const host = pageRef.current;
      const topbar = topbarRef.current;
      if (!host || !topbar) return;

      const nextTop = Math.max(0, Math.round(topbar.getBoundingClientRect().bottom));
      host.style.setProperty("--mobile-strip-top", `${nextTop}px`);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateStripTop);
    };

    updateStripTop();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [mobileSearchOpen]);

  return (
    <div ref={pageRef} className="home-page">

      {/* Topbar */}
      <header
        ref={topbarRef}
        className={`topbar${mobileSearchOpen ? " mobile-search-open" : ""}`}
      >

        <div className="topbar-brand">
          <button
            type="button"
            className={`mobile-quick-action-btn topbar-quick-action-btn${mobileQuickActionsOpen ? " is-active" : ""}`}
            aria-label={mobileQuickActionsOpen ? "Hide quick actions" : "Show quick actions"}
            aria-expanded={mobileQuickActionsOpen}
            aria-controls="quick-actions-drawer"
            onClick={() => {
              setMobileQuickActionsOpen((current) => !current);
              setMobileSearchOpen(false);
            }}
          >
            <img src={quickActionIcon} alt="" className="mobile-quick-action-icon" aria-hidden="true" />
          </button>
          <img src={headerLogo} alt="NoteSync logo" className="brand-logo" draggable={false} />
          <span>NoteSync</span>
        </div>

        <div className="topbar-search">
          <div className="search-field">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Search notes"
              className="search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {/* Profile */}
        <ProfileMenu
          isFullscreen={isFullscreen}
          mobileSearchOpen={mobileSearchOpen}
          mobileQuickActionsOpen={mobileQuickActionsOpen}
          setMobileSearchOpen={setMobileSearchOpen}
          setMobileQuickActionsOpen={setMobileQuickActionsOpen}
          onToggleFullscreen={handleToggleFullscreen}
          avatarUrl={avatarUrl}
          initial={initial}
          displayName={displayName}
          notificationSummary={notificationSummary}
          notificationsState={notificationsState}
          onEnableNotifications={() => {
            void ensurePushNotifications({ forcePermissionPrompt: true });
          }}
          googleCalendarState={googleCalendarState}
          onConnectGoogleCalendar={() => {
            void connectGoogleCalendar();
          }}
          onDisconnectGoogleCalendar={() => {
            void disconnectGoogleCalendar();
          }}
          isDarkTheme={isDarkTheme}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
        />

        <div className={`mobile-search-overlay${mobileSearchOpen ? " is-open" : ""}`}>
          <input
            ref={mobileSearchInputRef}
            type="text"
            placeholder="Search notes"
            className="mobile-search-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

      </header>

      {/* Drawer backdrop */}
      {mobileQuickActionsOpen && (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onClick={() => setMobileQuickActionsOpen(false)}
        />
      )}

      {/* Layout */}
      <div className="layout-shell">

        {/* Sidebar */}
        <aside
          id="quick-actions-drawer"
          className={`sidebar${mobileQuickActionsOpen ? " mobile-open" : ""}`}
        >

          <FeatureBox
            activeFilter={activeFilter}
            activeTag={activeTag}
            onSelectFilter={(filter) => {
              setActiveFilter(filter);
              setActiveTag("");
              setMobileQuickActionsOpen(false);
            }}
            onSelectTag={(tagTone) => {
              setActiveTag((current) => (current === tagTone ? "" : tagTone));
              setActiveFilter("all");
              setMobileQuickActionsOpen(false);
            }}
          />

        </aside>

        {/* Main */}
        <main className="main-content">

          <section className="hero-banner">
            <div className="hero-text">
              <h1>
                Welcome back, {displayName}{" "}
                <span aria-hidden="true">👋</span>
              </h1>
              <p>Your notes, synced beautifully.</p>
            </div>
          </section>

          {integrationNotice ? (
            <div className="integration-banner" role="status">
              {integrationNotice}
            </div>
          ) : null}

          <section className="notes-area">
            <Card
              notes={filteredNotes}
              emptyLabel={activeFilter === "archived" ? "No archived notes yet." : "No notes found yet."}
              searchTerm={searchTerm}
              loading={loading}
              error={error}
              savingById={savingById}
              summarizingById={summarizingById}
              updateNote={updateNote}
              summarizeNote={summarizeNote}
              deleteNote={deleteNote}
              archiveNote={archiveNote}
              revertNote={revertNote}
              flushNote={flushNote}
              uploadImageForNote={uploadImageForNote}
              removeImageForNote={removeImageForNote}
              onReminderAssigned={handleReminderAssigned}
              focusedNoteId={focusedNoteId}
            />
          </section>

        </main>

      </div>

      <FloatingCreate onSave={handleCreateNote} />

    </div>
  );
}
