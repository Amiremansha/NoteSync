import React, { useRef, useState, useEffect, useCallback } from "react";
import "./FloatingCreate.css";
import "./Mobile_Opt/FloatingCreateMobile.css";
import { ReminderIcon } from "./CardMenu.jsx";
import { getCurrentReminderDateTime, isPastReminder } from "../lib/calendar";

const FAB_NEW_ID = "__fab_new__";

const DESKTOP_GAP = 48;
const MIN_DUR = 360;
const MAX_DUR = 820;
const DIST_WEIGHT = 360;
const SCALE_WEIGHT = 90;
const CLOSE_RATIO = 0.78;
const CARD_RADIUS = "20px";
const OPEN_EASING = "cubic-bezier(0.3, 0.08, 0.2, 1)";
const CLOSE_EASING = "cubic-bezier(0.32, 1.12, 0.32, 1.03)";
const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0px) scale(1, 1)";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function calcDuration(fromRect, toRect) {
  const fromCenterX = fromRect.left + fromRect.width / 2;
  const fromCenterY = fromRect.top + fromRect.height / 2;
  const toCenterX = toRect.left + toRect.width / 2;
  const toCenterY = toRect.top + toRect.height / 2;
  const viewportDiag = Math.hypot(window.innerWidth, window.innerHeight) || 1;
  const dist = Math.hypot(fromCenterX - toCenterX, fromCenterY - toCenterY);
  const distRatio = clamp(dist / viewportDiag, 0, 1);
  const distCurve = Math.pow(distRatio, 1.6);

  const fromAreaRoot = Math.sqrt(Math.max(1, fromRect.width * fromRect.height));
  const toAreaRoot = Math.sqrt(Math.max(1, toRect.width * toRect.height));
  const scaleRatio = toAreaRoot / fromAreaRoot;
  const scaleBoost = clamp(Math.log2(Math.max(1, scaleRatio)) / 3, 0, 1);

  const duration = MIN_DUR + distCurve * DIST_WEIGHT + scaleBoost * SCALE_WEIGHT;
  return Math.round(clamp(duration, MIN_DUR, MAX_DUR));
}

function getExpandedRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw <= 640;
  const isTablet = vw > 640 && vw <= 1024;

  const horizontalGap = isMobile ? 12 : isTablet ? 24 : DESKTOP_GAP;
  const verticalGap = isMobile ? 16 : isTablet ? 24 : DESKTOP_GAP;

  const maxAllowedWidth = vw - horizontalGap * 2;
  const maxWidth = isMobile ? maxAllowedWidth : isTablet ? 720 : 520;
  const minWidth = isMobile ? 300 : 320;

  const height = Math.max(320, vh - verticalGap * 2);
  const preferredWidth = isMobile ? height * 0.95 : isTablet ? height * 0.76 : height * 0.58;
  const width = clamp(preferredWidth, minWidth, Math.min(maxAllowedWidth, maxWidth));

  return { top: verticalGap, left: (vw - width) / 2, width, height };
}

function forceReflow(el) {
  void el.getBoundingClientRect();
}

function getFlipTransform(fromRect, toRect) {
  const fromWidth = Math.max(1, fromRect.width || 0);
  const fromHeight = Math.max(1, fromRect.height || 0);
  const toWidth = Math.max(1, toRect.width || 0);
  const toHeight = Math.max(1, toRect.height || 0);
  const translateX = fromRect.left - toRect.left;
  const translateY = fromRect.top - toRect.top;
  const scaleX = fromWidth / toWidth;
  const scaleY = fromHeight / toHeight;

  return `translate3d(${translateX}px, ${translateY}px, 0px) scale(${scaleX}, ${scaleY})`;
}

function useFabExpansion() {
  const [expandedId, setExpandedId] = useState(null);
  const [cardDuration, setCardDuration] = useState(400);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [cardStyle, setCardStyle] = useState({});

  const cardRefs = useRef({});
  const phaseRef = useRef("idle");
  const openDur = useRef(400);
  const timers = useRef([]);
  const fabSourceRect = useRef(null);
  const sourceRadiusById = useRef({});

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const setCardRef = useCallback((id, element) => {
    cardRefs.current[id] = element;
  }, []);

  const after = useCallback((fn, delay) => {
    const t = setTimeout(fn, delay);
    timers.current.push(t);
    return t;
  }, []);

  const fullReset = useCallback(() => {
    setExpandedId(null);
    setIsOpening(false);
    setIsClosing(false);
    setCardStyle({});
    fabSourceRect.current = null;
    phaseRef.current = "idle";
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const expandFromFab = useCallback((fabEl) => {
    const phase = phaseRef.current;
    if (phase === "opening") return;
    if (phase === "open") return;
    if (phase === "closing") {
      clearTimers();
      fullReset();
    }

    const rect = fabEl.getBoundingClientRect();
    const target = getExpandedRect();
    const dur = calcDuration(rect, target);
    const fromSourceTransform = getFlipTransform(rect, target);
    fabSourceRect.current = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    sourceRadiusById.current[FAB_NEW_ID] = "50%";

    openDur.current = dur;
    setCardDuration(dur);
    phaseRef.current = "opening";
    setIsOpening(true);

    setExpandedId(FAB_NEW_ID);
    setIsClosing(false);

    setCardStyle({
      top: target.top,
      left: target.left,
      width: target.width,
      height: target.height,
      borderRadius: "50%",
      boxShadow: "none",
      transformOrigin: "top left",
      transform: fromSourceTransform,
      transition: "none",
      "--card-duration": `${dur}ms`,
      "--card-easing": OPEN_EASING,
    });

    requestAnimationFrame(() => {
      forceReflow(document.body);
      requestAnimationFrame(() => {
        setCardStyle({
          ...target,
          borderRadius: CARD_RADIUS,
          boxShadow: "none",
          transformOrigin: "top left",
          transform: IDENTITY_TRANSFORM,
          "--card-duration": `${dur}ms`,
          "--card-easing": OPEN_EASING,
        });
        after(() => {
          phaseRef.current = "open";
          setIsOpening(false);
        }, dur + 30);
      });
    });
  }, [after, clearTimers, fullReset]);

  const closeCard = useCallback(() => {
    const phase = phaseRef.current;
    if (phase !== "open" && phase !== "opening") return;
    clearTimers();

    const id = expandedId;
    const dur = Math.round(openDur.current * CLOSE_RATIO);
    setCardDuration(dur);

    const sourceRect = fabSourceRect.current;
    const endRadius = sourceRadiusById.current[id] || "50%";

    const card = cardRefs.current[id];
    if (!card || !sourceRect) {
      fullReset();
      return;
    }

    const liveRect = card.getBoundingClientRect();
    const toSourceTransform = getFlipTransform(sourceRect, liveRect);
    phaseRef.current = "closing";
    setIsOpening(false);
    setIsClosing(true);

    setCardStyle({
      top: liveRect.top,
      left: liveRect.left,
      width: liveRect.width,
      height: liveRect.height,
      borderRadius: CARD_RADIUS,
      boxShadow: "none",
      transformOrigin: "top left",
      transform: IDENTITY_TRANSFORM,
      transition: "none",
      "--card-duration": `${dur}ms`,
      "--card-easing": CLOSE_EASING,
    });

    requestAnimationFrame(() => {
      forceReflow(card);
      requestAnimationFrame(() => {
        setCardStyle({
          top: liveRect.top,
          left: liveRect.left,
          width: liveRect.width,
          height: liveRect.height,
          borderRadius: endRadius,
          boxShadow: "none",
          transformOrigin: "top left",
          transform: toSourceTransform,
          "--card-duration": `${dur}ms`,
          "--card-easing": CLOSE_EASING,
        });

        after(() => {
          setCardStyle({
            top: sourceRect.top,
            left: sourceRect.left,
            width: sourceRect.width,
            height: sourceRect.height,
            borderRadius: endRadius,
            boxShadow: "none",
            transformOrigin: "top left",
            transform: IDENTITY_TRANSFORM,
            transition: "none",
            "--card-duration": `${dur}ms`,
            "--card-easing": CLOSE_EASING,
          });

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              fullReset();
            });
          });
        }, dur + 40);
      });
    });
  }, [expandedId, after, clearTimers, fullReset]);

  const overlay = expandedId ? (
    <div
      className={`fc-overlay${isClosing ? " closing" : ""}`}
      style={{ "--card-duration": `${cardDuration}ms` }}
      onClick={closeCard}
    />
  ) : null;

  return {
    expandedId,
    isOpening,
    isClosing,
    cardStyle,
    setCardRef,
    expandFromFab,
    closeCard,
    overlay,
  };
}

// ─── New Note Form — matches expanded card UI exactly ────────────────────────
function NewNoteCard({ closeCard, isClosing, onSave }) {
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [leaving, setLeaving] = useState(false);
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => bodyRef.current?.focus(), 340);
    return () => clearTimeout(t);
  }, []);

  const handleSave = () => {
    if (leaving || reminderIsPast) return;
    setLeaving(true);
    onSave?.({ reminderAt, header: header.trim(), body: body.trim(), imageFile });
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setTimeout(() => closeCard(), 60);
  };

  const handleDiscard = () => {
    if (leaving) return;
    setLeaving(true);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setTimeout(() => closeCard(), 60);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageSelected = (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    event.target.value = "";
    bodyRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (((e.ctrlKey || e.metaKey) && e.key === "Enter") || (e.shiftKey && e.key === "Enter")) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") handleDiscard();
  };

  const nowReminder = getCurrentReminderDateTime();
  const reminderIsPast = reminderAt ? isPastReminder(reminderAt) : false;

  return (
    <div
      className={`new-note-card${isClosing || leaving ? " is-leaving" : ""}`}
      onKeyDown={handleKeyDown}
    >
      {/* ── Top row: reminder ── */}
      <div className="nnc-top-row">
        <div className="nnc-reminder-input-wrap">
          <label className="nnc-reminder-trigger" aria-label="Reminder date and time">
            <ReminderIcon className="nnc-reminder-icon" />
            <input
              type="datetime-local"
              className="nnc-date-input-overlay"
              value={reminderAt}
              min={nowReminder.datetimeLocalValue}
              aria-invalid={reminderIsPast}
              onChange={(e) => setReminderAt(e.target.value)}
              aria-label="Reminder date and time"
            />
          </label>
        </div>
        {reminderIsPast ? <span className="nnc-error">Reminder must be in the future</span> : null}
      </div>

      {/* ── Title — large bold, matches card header typography ── */}
      <input
        className="nnc-header-input"
        value={header}
        onChange={(e) => setHeader(e.target.value)}
        placeholder="Title"
        maxLength={120}
      />

      {/* ── Full-width divider ── */}
      <div className="nnc-divider" />

      {/* ── Body ── */}
      <textarea
        ref={bodyRef}
        className="nnc-body-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Start typing…"
      />

      {imagePreview && (
        <div className="nnc-image-preview">
          <img src={imagePreview} alt="Selected" />
        </div>
      )}

      {/* ── Save / Discard ── */}
      <div className="nnc-actions">
        <div className="nnc-actions-left">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="nnc-upload-input"
            onChange={handleImageSelected}
          />
          <button type="button" className="nnc-btn nnc-btn-upload" onClick={handleUploadClick}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 16V5" />
              <path d="m7 10 5-5 5 5" />
              <path d="M5 19h14" />
            </svg>
            Upload image
          </button>
        </div>

        <div className="nnc-actions-right">
          <button type="button" className="nnc-btn nnc-btn-discard" onClick={handleDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="nnc-btn nnc-btn-save"
            onClick={handleSave}
            disabled={(!header.trim() && !body.trim() && !imageFile) || reminderIsPast}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FloatingCreate ───────────────────────────────────────────────────────────
// Self-contained: owns its own FAB expansion hook.
// Only prop needed from parent: onSave({ reminderAt, header, body, imageFile })
export default function FloatingCreate({ onSave }) {
  const mainFabRef = useRef(null);

  // The hook lives HERE — no parent wiring needed
  const {
    expandedId,
    isClosing,
    cardStyle,
    setCardRef,
    expandFromFab,
    closeCard,
    overlay,
  } = useFabExpansion();

  const iconMorphing = expandedId === FAB_NEW_ID;

  // Register the flying card so closeCard() can read its live position
  const flyingCardRef = (el) => {
    setCardRef(FAB_NEW_ID, el);
  };

  const handleOpenNoteCard = () => {
    if (iconMorphing || !mainFabRef.current) return;
    expandFromFab(mainFabRef.current);
  };

  return (
    <>
      {/* Dim overlay — closes card when tapped outside */}
      {overlay}

      {/* Flying card — blooms from icon, collapses back to it */}
      {iconMorphing && (
        <div
          ref={flyingCardRef}
          className="fab-flying-card"
          style={{ position: "fixed", zIndex: 1300, ...cardStyle }}
        >
          <NewNoteCard
            closeCard={closeCard}
            isClosing={isClosing}
            onSave={onSave}
          />
        </div>
      )}

      {/* Main FAB only: opens the new note card directly */}
      <div
        className="create-note-wrapper"
        aria-label="Create note"
      >
        {/* Main FAB */}
        <button
          type="button"
          ref={mainFabRef}
          className={`create-main-btn${iconMorphing ? " fab-hidden" : ""}`}
          aria-label="Create note"
          onClick={handleOpenNoteCard}
        >
          <svg
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
    </>
  );
}
