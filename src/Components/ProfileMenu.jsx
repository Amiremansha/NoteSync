import { useEffect, useRef, useState } from "react";
import ThemeSwitch from "./ThemeToggle.jsx";
import "./ProfileMenu.css";
import "./Mobile_Opt/ProfileMenuMobile.css";

export default function ProfileMenu({
  isFullscreen = false,
  mobileSearchOpen = false,
  mobileQuickActionsOpen = false,
  setMobileSearchOpen = () => {},
  setMobileQuickActionsOpen = () => {},
  onToggleFullscreen = () => {},
  avatarUrl = "",
  initial = "U",
  displayName = "User",
  notificationSummary = "Not enabled",
  notificationsState = { syncing: false, supported: false, configured: false },
  onEnableNotifications = () => {},
  googleCalendarState = { connected: false, email: null, loading: false },
  onConnectGoogleCalendar = () => {},
  onDisconnectGoogleCalendar = () => {},
  isDarkTheme = false,
  onToggleTheme = () => {},
  onLogout = () => {},
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileContainerRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const profileContainer = profileContainerRef.current;
      if (!profileContainer) return;
      if (!profileContainer.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!mobileQuickActionsOpen && !mobileSearchOpen) return;
    setProfileOpen(false);
  }, [mobileQuickActionsOpen, mobileSearchOpen]);

  return (
    <div ref={profileContainerRef} className="profile-container">
      <button
        type="button"
        className={`fullscreen-toggle${isFullscreen ? " is-active" : ""}`}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={() => {
          onToggleFullscreen();
          setProfileOpen(false);
          setMobileQuickActionsOpen(false);
        }}
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3H5a2 2 0 0 0-2 2v4" />
            <path d="M3 15v4a2 2 0 0 0 2 2h4" />
            <path d="M15 3h4a2 2 0 0 1 2 2v4" />
            <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9V5a2 2 0 0 1 2-2h4" />
            <path d="M3 15v4a2 2 0 0 0 2 2h4" />
            <path d="M15 3h4a2 2 0 0 1 2 2v4" />
            <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="mobile-search-toggle"
        aria-label={mobileSearchOpen ? "Close search" : "Open search"}
        onClick={() => {
          setMobileSearchOpen((current) => !current);
          setProfileOpen(false);
          setMobileQuickActionsOpen(false);
        }}
      >
        {mobileSearchOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="profile-btn"
        onClick={() => {
          setProfileOpen((current) => !current);
          setMobileSearchOpen(false);
          setMobileQuickActionsOpen(false);
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" className="avatar-img" draggable={false} />
        ) : (
          <span className="avatar-fallback">{initial}</span>
        )}
      </button>

      {profileOpen && (
        <div className="profile-dropdown">
          <div className="dropdown-username">{displayName}</div>

          <div className="dropdown-section-label">Notifications</div>
          <div className="dropdown-detail">{notificationSummary}</div>
          <button
            type="button"
            className="dropdown-item"
            onClick={onEnableNotifications}
            disabled={
              notificationsState.syncing ||
              !notificationsState.supported ||
              !notificationsState.configured
            }
          >
            {notificationsState.syncing ? "Updating reminders..." : "Enable reminder notifications"}
          </button>

          <div className="dropdown-section-label">Calendar</div>
          {googleCalendarState.connected ? (
            <>
              <div className="dropdown-detail dropdown-detail-calendar-status">{googleCalendarState.email}</div>
              <button
                type="button"
                className="dropdown-item"
                onClick={onDisconnectGoogleCalendar}
                disabled={googleCalendarState.loading}
              >
                {googleCalendarState.loading ? "Disconnecting..." : "Disconnect Google Calendar"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="dropdown-item"
              onClick={onConnectGoogleCalendar}
              disabled={googleCalendarState.loading}
            >
              {googleCalendarState.loading ? "Connecting..." : "Connect Google Calendar"}
            </button>
          )}

          <button
            type="button"
            className="dropdown-item theme-item"
            onClick={onToggleTheme}
          >
            Theme <ThemeSwitch isDark={isDarkTheme} onToggle={onToggleTheme} />
          </button>
          <div className="profile-logout-separator" />

          <button
            type="button"
            className="dropdown-item logout"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
