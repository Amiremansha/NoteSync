import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./CardMenu.css";
import archiveIcon from "../assets/archive.svg";

const TAGS = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Gray"];

export const ReminderIcon = ({ className = "menu-item-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20.59 14.86V10.09A8.6 8.6 0 0 0 12 1.5 8.6 8.6 0 0 0 3.41 10.09v4.77L1.5 16.77v1.91h21V16.77Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.69 18.68a2.55 2.55 0 0 1 .17 1 2.86 2.86 0 0 1-5.72 0 2.55 2.55 0 0 1 .17-1"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TagIcon = () => (
  <svg className="menu-item-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
  </svg>
);

// Eye icons use the same paths as assets/eye-open.svg and assets/eye-close.svg, recolored via currentColor.
const EyeIcon = () => (
  <svg className="menu-item-icon menu-item-icon-eye" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 9.75C10.755 9.75 9.75 10.755 9.75 12C9.75 13.245 10.755 14.25 12 14.25C13.245 14.25 14.25 13.245 14.25 12C14.25 10.755 13.245 9.75 12 9.75ZM8.25 12C8.25 9.92657 9.92657 8.25 12 8.25C14.0734 8.25 15.75 9.92657 15.75 12C15.75 14.0734 14.0734 15.75 12 15.75C9.92657 15.75 8.25 14.0734 8.25 12Z"
      fill="currentColor"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.28282 9.27342C4.69299 5.94267 8.19618 3.96997 12.0001 3.96997C15.8042 3.96997 19.3075 5.94286 21.7177 9.27392C22.2793 10.0479 22.5351 11.0421 22.5351 11.995C22.5351 12.948 22.2792 13.9424 21.7174 14.7165C19.3072 18.0473 15.804 20.02 12.0001 20.02C8.19599 20.02 4.69264 18.0471 2.28246 14.716C1.7209 13.942 1.46509 12.9478 1.46509 11.995C1.46509 11.0419 1.721 10.0475 2.28282 9.27342ZM12.0001 5.46997C8.74418 5.46997 5.66753 7.15436 3.49771 10.1532L3.497 10.1542C3.15906 10.6197 2.96509 11.2866 2.96509 11.995C2.96509 12.7033 3.15906 13.3703 3.497 13.8357L3.49771 13.8367C5.66753 16.8356 8.74418 18.52 12.0001 18.52C15.256 18.52 18.3326 16.8356 20.5025 13.8367L20.5032 13.8357C20.8411 13.3703 21.0351 12.7033 21.0351 11.995C21.0351 11.2866 20.8411 10.6197 20.5032 10.1542L20.5025 10.1532C18.3326 7.15436 15.256 5.46997 12.0001 5.46997Z"
      fill="currentColor"
    />
  </svg>
);

const EyeClosedIcon = () => (
  <svg className="menu-item-icon menu-item-icon-eye" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M15.6487 5.39489C14.4859 4.95254 13.2582 4.72021 12 4.72021C8.46997 4.72021 5.17997 6.54885 2.88997 9.71381C1.98997 10.9534 1.98997 13.037 2.88997 14.2766C3.34474 14.9051 3.83895 15.481 4.36664 16.0002"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.3248 7.69653C19.9692 8.28964 20.5676 8.96425 21.11 9.71381C22.01 10.9534 22.01 13.037 21.11 14.2766C18.82 17.4416 15.53 19.2702 12 19.2702C10.6143 19.2702 9.26561 18.9884 7.99988 18.4547"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 12C15 13.6592 13.6592 15 12 15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.0996 9.85541C13.5589 9.32599 12.8181 9 12 9C10.3408 9 9 10.3408 9 12C9 12.7293 9.25906 13.3971 9.69035 13.9166"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 21.0002L22 2.7002"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const DeleteIcon = () => (
  <svg className="menu-item-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 7h16M10 11.5v5M14 11.5v5M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9 7V5.6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.6V7"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArchiveIcon = () => (
  <img src={archiveIcon} alt="" className="menu-item-icon menu-item-icon-asset" aria-hidden="true" />
);

function SlidingNoteMenu({
  showTags = false,
  isSummaryVisible = false,
  showRemoveReminderToggle = false,
  isArchived = false,
  activeTag = "",
  menuStyle = {},
  onHeightChange = () => {},
  onReminder = () => {},
  onRemoveReminder = () => {},
  onRemoveReminderHoverStart = () => {},
  onRemoveReminderHoverEnd = () => {},
  onToggleSummaryVisibility = () => {},
  onOpenTags = () => {},
  onBack = () => {},
  onArchive = () => {},
  onSelectTag = () => {},
  onDelete = () => {},
}) {
  const mainContentRef = useRef(null);
  const tagContentRef = useRef(null);
  const [menuHeight, setMenuHeight] = useState(0);

  useLayoutEffect(() => {
    const activeContent = showTags ? tagContentRef.current : mainContentRef.current;

    if (!activeContent) return undefined;

    let rafId = 0;
    const updateHeight = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nextHeight = activeContent.scrollHeight;
        setMenuHeight(nextHeight);
        onHeightChange(nextHeight);
      });
    };

    updateHeight();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateHeight) : null;
    observer?.observe(activeContent);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      cancelAnimationFrame(rafId);
    };
  }, [showTags, isSummaryVisible, onHeightChange]);

  return (
    <div
      className="note-menu"
      onClick={(event) => event.stopPropagation()}
      style={{
        height: menuHeight ? `${menuHeight}px` : undefined,
        ...menuStyle,
      }}
    >
      <div className={`note-menu-slider${showTags ? " is-tags" : ""}`}>
        <div className="note-menu-view">
          <div className="note-menu-content" ref={mainContentRef}>
            <button
              type="button"
              className="menu-item"
              onClick={onReminder}
              onMouseEnter={onRemoveReminderHoverStart}
              onMouseLeave={onRemoveReminderHoverEnd}
            >
              <ReminderIcon />
              <span>Reminder</span>
            </button>
            <div
              className={`menu-summary-toggle-wrap menu-remove-reminder-wrap${
                showRemoveReminderToggle ? " is-visible" : ""
              }`}
              onMouseEnter={onRemoveReminderHoverStart}
              onMouseLeave={onRemoveReminderHoverEnd}
            >
              <button
                type="button"
                className="menu-item menu-summary-toggle"
                onClick={onRemoveReminder}
              >
                <span>Remove reminder</span>
              </button>
            </div>
            <button type="button" className="menu-item" onClick={onArchive}>
              <ArchiveIcon />
              <span>{isArchived ? "Unarchive" : "Archive"}</span>
            </button>
            <button type="button" className="menu-item" onClick={onOpenTags}>
              <TagIcon />
              <span>Tag</span>
            </button>
            <button type="button" className="menu-item" onClick={onToggleSummaryVisibility}>
              {isSummaryVisible ? <EyeClosedIcon /> : <EyeIcon />}
              <span>AI box</span>
            </button>
            <div className="menu-divider"></div>
            <button type="button" className="menu-item delete-item" onClick={onDelete}>
              <DeleteIcon />
              <span>Delete</span>
            </button>
          </div>
        </div>

        <div className="note-menu-view">
          <div className="note-menu-content" ref={tagContentRef}>
            <button type="button" className="menu-back-btn" onClick={onBack}>
              <strong>Back</strong>
            </button>
            <div className="menu-divider"></div>
            <button
              type="button"
              className={`tag-option${!activeTag ? " is-active" : ""}`}
              onClick={() => onSelectTag("")}
            >
              <span className="tag-dot gray" />
              <span>No tag</span>
            </button>
            {TAGS.map((tag) => {
              const tone = tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  className={`tag-option${activeTag === tone ? " is-active" : ""}`}
                  onClick={() => onSelectTag(tone)}
                >
                  <span className={`tag-dot ${tone}`} />
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardMenu({
  isOpen = false,
  showTags = false,
  isSummaryVisible = false,
  showRemoveReminderToggle = false,
  isArchived = false,
  activeTag = "",
  onToggle = () => {},
  onReminder = () => {},
  onRemoveReminder = () => {},
  onRemoveReminderHoverStart = () => {},
  onRemoveReminderHoverEnd = () => {},
  onToggleSummaryVisibility = () => {},
  onOpenTags = () => {},
  onBack = () => {},
  onArchive = () => {},
  onSelectTag = () => {},
  onDelete = () => {},
}) {
  const menuButtonRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuMeasuredHeight, setMenuMeasuredHeight] = useState(0);

  const updateMenuPosition = useCallback(() => {
    const buttonEl = menuButtonRef.current;
    if (!buttonEl || typeof window === "undefined") return;

    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = 176;
    const viewportPadding = 8;
    const gap = 6;
    const estimatedHeight = menuMeasuredHeight || 260;
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
    );
    const preferredTop = rect.bottom + gap;
    const maxTop = window.innerHeight - estimatedHeight - viewportPadding;
    const top = Math.min(
      Math.max(viewportPadding, preferredTop),
      Math.max(viewportPadding, maxTop)
    );

    setMenuStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      right: "auto",
      zIndex: 3000,
    });
  }, [menuMeasuredHeight]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen, updateMenuPosition, showTags, isSummaryVisible, showRemoveReminderToggle]);

  return (
    <>
      <button
        type="button"
        ref={menuButtonRef}
        className="note-menu-btn"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(event);
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        ⋮
      </button>
      {isOpen && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <SlidingNoteMenu
              showTags={showTags}
              isSummaryVisible={isSummaryVisible}
              showRemoveReminderToggle={showRemoveReminderToggle}
              isArchived={isArchived}
              activeTag={activeTag}
              menuStyle={menuStyle}
              onHeightChange={setMenuMeasuredHeight}
              onReminder={onReminder}
              onRemoveReminder={onRemoveReminder}
              onRemoveReminderHoverStart={onRemoveReminderHoverStart}
              onRemoveReminderHoverEnd={onRemoveReminderHoverEnd}
              onToggleSummaryVisibility={onToggleSummaryVisibility}
              onOpenTags={onOpenTags}
              onBack={onBack}
              onArchive={onArchive}
              onSelectTag={onSelectTag}
              onDelete={onDelete}
            />,
            document.body
          )
        : null}
    </>
  );
}
