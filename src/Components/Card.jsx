import React, { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from "react";
import "./Card.css";
import "./Mobile_Opt/CardMobile.css";
import AISummary from "./AISummary.jsx";
import { useCardExpansion } from "./CardExpansionAnimation.jsx";
import {
  formatReminderLabel,
  isoToReminderDate,
  isoToReminderTime,
  getCurrentReminderDateTime,
  reminderDateTimeToIso,
} from "../lib/calendar";
import CardMenu, { ReminderIcon } from "./CardMenu.jsx";

const MASONRY_ROW_HEIGHT = 4;
const MASONRY_GAP = 16;
// Enable masonry grid on all viewports; column count is controlled via CSS media queries.
const DESKTOP_MASONRY_QUERY = "(min-width: 0px)";
const DEFAULT_AI_PROMPT = "Summarize this note into clear, scannable bullets.";
const IMAGE_THUMB_SIZE = 132;
const IMAGE_THUMB_MARGIN = 10;
const IMAGE_REPOSITION_EPSILON = 1;
const AI_OVERLAY_SCROLL_PAD_COLLAPSED = 100;
const AI_OVERLAY_SCROLL_PAD_EXPANDED = 215;
const AI_OVERLAY_EXTRA_TOP_CLEARANCE = 25;
const AI_OVERLAY_EXTRA_GAP = 4;
const COLLAPSED_TEXT_STEP_MS = 26;
const COLLAPSED_TEXT_MAX_DELAY_MS = 520;

const getCollapsedDisplayTitle = (title) => {
  const fullTitle = (title || "Untitled").trim();
  return fullTitle.length > 12 ? `${fullTitle.slice(0, 12)}...` : fullTitle;
};

const formatReminderChipLabel = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeLabel = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (sameDay(date, now)) return `Today · ${timeLabel}`;
  if (sameDay(date, tomorrow)) return `Tomorrow · ${timeLabel}`;

  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${dateLabel} · ${timeLabel}`;
};

function AnimatedCollapsedText({
  as = "p",
  className = "",
  text = "",
  animate = false,
  cycle = 0,
}) {
  const tokens = useMemo(() => (typeof text === "string" ? text.split(/(\s+)/) : []), [text]);
  const TagName = as;

  if (!animate) {
    return React.createElement(TagName, { className }, text);
  }

  return (
    <TagName className={`${className} collapsed-text-reveal`}>
      {tokens.map((token, index) => {
        if (!token || /^\s+$/.test(token)) return token;

        const wordIndex = tokens
          .slice(0, index)
          .filter((currentToken) => currentToken && !/^\s+$/.test(currentToken)).length;
        const delay = Math.min(wordIndex * COLLAPSED_TEXT_STEP_MS, COLLAPSED_TEXT_MAX_DELAY_MS);

        return (
          <span
            key={`${cycle}-${index}`}
            className="collapsed-text-word"
            style={{ animationDelay: `${delay}ms` }}
          >
            {token}
          </span>
        );
      })}
    </TagName>
  );
}

const formatNoteDate = (updatedAt) => {
  if (!updatedAt) {
    return "Just now";
  }

  const parsedDate = new Date(updatedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Just now";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export default function Card({
  notes = [],
  searchTerm = "",
  loading = false,
  error = null,
  emptyLabel = "No notes found yet.",
  savingById = {},
  summarizingById = {},
  uploadImageForNote = async () => null,
  removeImageForNote = async () => true,
  updateNote = () => {},
  summarizeNote = async () => null,
  revertNote = async () => null,
  flushNote = async () => null,
  archiveNote = async () => null,
  deleteNote = async () => null,
  onReminderAssigned = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuView, setMenuView] = useState("main");
  const [summaryVisibilityById, setSummaryVisibilityById] = useState({});
  const [recentlyClosedCardId, setRecentlyClosedCardId] = useState(null);
  const [removeReminderToggleForId, setRemoveReminderToggleForId] = useState(null);
  const [reminderTimeDraftById, setReminderTimeDraftById] = useState({});
  const [isDesktopMasonryEnabled, setIsDesktopMasonryEnabled] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return true;
    }

    return window.matchMedia(DESKTOP_MASONRY_QUERY).matches;
  });
  const TOP_CLIP_GUARD_PX = 1;
  const expandedUploadInputRef = useRef(null);
  const reminderInputRef = useRef(null);
  const removeReminderToggleTimerRef = useRef(null);
  const recentlyClosedCardTimerRef = useRef(null);
  const cardWrapperRefs = useRef(new Map());
  const previousWrapperRectsRef = useRef(new Map());
  const hasMeasuredLayoutRef = useRef(false);
  const suppressWrapperFlipUntilRef = useRef(0);
  const [pendingReminderFocusId, setPendingReminderFocusId] = useState(null);
  const [reminderEditorForId, setReminderEditorForId] = useState(null);
  const [textDraftById, setTextDraftById] = useState({});
  const [imageThumbPosById, setImageThumbPosById] = useState({});
  const [imageThumbPreferredPosById, setImageThumbPreferredPosById] = useState({});
  const [imageExpandedById, setImageExpandedById] = useState({});
  const [imageThumbDraggingById, setImageThumbDraggingById] = useState({});
  const [aiOverlayReserveById, setAiOverlayReserveById] = useState({});
  const expandedBodyLayerRef = useRef(null);
  const aiOverlayRefs = useRef(new Map());
  const ignoreNextSaveClickRef = useRef(false);
  const imageDragStateRef = useRef({
    active: false,
    moved: false,
    noteId: "",
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    suppressClick: false,
  });

  const {
    expandedId,
    isOpening,
    isClosing,
    cardStyle,
    placeholderStyle,
    setCardRef,
    expandCard: expandCardHook,
    closeCard: closeCardHook,
    overlay,
  } = useCardExpansion();

  const expandedNote = useMemo(
    () => notes.find((note) => note.id === expandedId) ?? null,
    [expandedId, notes]
  );
  const expandedIsAiVisible = expandedId ? (summaryVisibilityById[expandedId] ?? true) : false;
  const expandedIsAiCollapsed = expandedId ? true : true; // Now managed by AISummary hook
  const expandedIsSummarizing = expandedId ? Boolean(summarizingById[expandedId]) : false;
  const expandedSummaryText = expandedNote?.summary ?? "";
  const [imageViewer, setImageViewer] = useState(null);
  const isImageViewerOpen = Boolean(imageViewer?.url);

  const closeImageViewer = useCallback(() => {
    setImageViewer(null);
  }, []);

  const clampThumbPosition = useCallback((x, y, containerElement, bottomInset = 0) => {
    if (!(containerElement instanceof Element)) {
      return { x: IMAGE_THUMB_MARGIN, y: IMAGE_THUMB_MARGIN };
    }

    const { width, height } = containerElement.getBoundingClientRect();
    const maxX = Math.max(IMAGE_THUMB_MARGIN, width - IMAGE_THUMB_SIZE - IMAGE_THUMB_MARGIN);
    const maxY = Math.max(
      IMAGE_THUMB_MARGIN,
      height - IMAGE_THUMB_SIZE - IMAGE_THUMB_MARGIN - bottomInset
    );

    return {
      x: Math.min(Math.max(IMAGE_THUMB_MARGIN, x), maxX),
      y: Math.min(Math.max(IMAGE_THUMB_MARGIN, y), maxY),
    };
  }, []);

  const needsThumbReposition = useCallback((currentPosition, nextPosition) => {
    if (!currentPosition || !nextPosition) return false;
    return (
      Math.abs(nextPosition.x - currentPosition.x) > IMAGE_REPOSITION_EPSILON ||
      Math.abs(nextPosition.y - currentPosition.y) > IMAGE_REPOSITION_EPSILON
    );
  }, []);

  const getImageClampBottomInset = useCallback(
    (noteId) => {
      const isAiVisible = summaryVisibilityById[noteId] ?? true;
      if (!isAiVisible) return 0;

      const measuredReserve = aiOverlayReserveById[noteId];
      if (typeof measuredReserve === "number" && measuredReserve > 0) {
        return measuredReserve;
      }

      // Use expanded padding by default (AI box is now managed by AISummary hook)
      return AI_OVERLAY_SCROLL_PAD_EXPANDED;
    },
    [aiOverlayReserveById, summaryVisibilityById]
  );

  const setAiOverlayRef = useCallback((noteId, element) => {
    if (element instanceof Element) {
      aiOverlayRefs.current.set(noteId, element);
      return;
    }

    aiOverlayRefs.current.delete(noteId);
  }, []);

  useLayoutEffect(() => {
    if (!expandedId) return undefined;

    const element = aiOverlayRefs.current.get(expandedId);
    if (!(element instanceof Element)) return undefined;

    if (!expandedIsAiVisible) {
      setAiOverlayReserveById((prev) => {
        if (prev[expandedId] === 0) return prev;
        return { ...prev, [expandedId]: 0 };
      });
      return undefined;
    }

    let rafId = 0;
    const measureOverlay = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const overlayHeight = element.getBoundingClientRect().height;
        const computedReserve = Math.ceil(
          overlayHeight + AI_OVERLAY_EXTRA_TOP_CLEARANCE + AI_OVERLAY_EXTRA_GAP
        );
        const fallbackReserve = expandedIsAiCollapsed
          ? AI_OVERLAY_SCROLL_PAD_COLLAPSED
          : AI_OVERLAY_SCROLL_PAD_EXPANDED;
        const nextReserve = Math.max(fallbackReserve, computedReserve);

        setAiOverlayReserveById((prev) => {
          if (prev[expandedId] === nextReserve) return prev;
          return { ...prev, [expandedId]: nextReserve };
        });
      });
    };

    measureOverlay();

    // Collapsed quick-action chips appear with a delay; measure again after they mount.
    const delayedMeasure = window.setTimeout(measureOverlay, 240);

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureOverlay) : null;
    observer?.observe(element);
    window.addEventListener("resize", measureOverlay);

    return () => {
      clearTimeout(delayedMeasure);
      observer?.disconnect();
      window.removeEventListener("resize", measureOverlay);
      cancelAnimationFrame(rafId);
    };
  }, [
    expandedId,
    expandedIsAiCollapsed,
    expandedIsAiVisible,
    expandedIsSummarizing,
    expandedSummaryText,
  ]);

  const snapThumbToNearestEdge = useCallback(
    (x, y, containerElement, bottomInset = 0) => {
      if (!(containerElement instanceof Element)) {
        return { x: IMAGE_THUMB_MARGIN, y: IMAGE_THUMB_MARGIN };
      }

      const clampedPosition = clampThumbPosition(x, y, containerElement, bottomInset);
      const { width, height } = containerElement.getBoundingClientRect();
      const maxX = Math.max(IMAGE_THUMB_MARGIN, width - IMAGE_THUMB_SIZE - IMAGE_THUMB_MARGIN);
      const maxY = Math.max(
        IMAGE_THUMB_MARGIN,
        height - IMAGE_THUMB_SIZE - IMAGE_THUMB_MARGIN - bottomInset
      );

      const distances = [
        { edge: "left", distance: Math.abs(clampedPosition.x - IMAGE_THUMB_MARGIN) },
        { edge: "right", distance: Math.abs(maxX - clampedPosition.x) },
        { edge: "top", distance: Math.abs(clampedPosition.y - IMAGE_THUMB_MARGIN) },
        { edge: "bottom", distance: Math.abs(maxY - clampedPosition.y) },
      ];

      const nearestEdge = distances.sort((a, b) => a.distance - b.distance)[0]?.edge;
      if (!nearestEdge) return clampedPosition;

      if (nearestEdge === "left") {
        return { ...clampedPosition, x: IMAGE_THUMB_MARGIN };
      }

      if (nearestEdge === "right") {
        return { ...clampedPosition, x: maxX };
      }

      if (nearestEdge === "top") {
        return { ...clampedPosition, y: IMAGE_THUMB_MARGIN };
      }

      return { ...clampedPosition, y: maxY };
    },
    [clampThumbPosition]
  );

  useEffect(() => {
    if (!expandedId || !expandedNote) return;

    setTextDraftById((prev) => {
      const existingDraft = prev[expandedId];
      if (existingDraft) {
        if (existingDraft.dirty) {
          return prev;
        }

        const syncedDraft = {
          title: expandedNote.title ?? "",
          content: expandedNote.content ?? "",
          dirty: false,
        };

        if (
          existingDraft.title === syncedDraft.title &&
          existingDraft.content === syncedDraft.content
        ) {
          return prev;
        }

        return { ...prev, [expandedId]: syncedDraft };
      }

      return {
        ...prev,
        [expandedId]: {
          title: expandedNote.title ?? "",
          content: expandedNote.content ?? "",
          dirty: false,
        },
      };
    });
  }, [expandedId, expandedNote]);

  useEffect(() => {
    if (!expandedId || !expandedNote?.image_url) return;

    const defaultPreferredPosition = {
      x: Number.MAX_SAFE_INTEGER,
      y: Number.MAX_SAFE_INTEGER,
    };

    setImageThumbPreferredPosById((prev) => {
      if (prev[expandedId]) return prev;
      return { ...prev, [expandedId]: defaultPreferredPosition };
    });
  }, [
    expandedId,
    expandedNote?.image_url,
  ]);

  useEffect(() => {
    if (!expandedId || !expandedNote?.image_url) return undefined;

    const handleResize = () => {
      if (imageExpandedById[expandedId]) return;

      const containerElement = expandedBodyLayerRef.current;
      if (!(containerElement instanceof Element)) return;

      setImageThumbPosById((prev) => {
        const currentPosition = prev[expandedId];
        if (!currentPosition) return prev;

        const preferredPosition = imageThumbPreferredPosById[expandedId] ?? currentPosition;
        const bottomInset = getImageClampBottomInset(expandedId);
        const clampedPosition = clampThumbPosition(
          preferredPosition.x,
          preferredPosition.y,
          containerElement,
          bottomInset
        );

        if (!needsThumbReposition(currentPosition, clampedPosition)) {
          return prev;
        }

        return { ...prev, [expandedId]: clampedPosition };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [
    clampThumbPosition,
    expandedId,
    expandedNote?.image_url,
    getImageClampBottomInset,
    imageExpandedById,
    imageThumbPreferredPosById,
    needsThumbReposition,
  ]);

  useLayoutEffect(() => {
    if (!expandedId || !expandedNote?.image_url) return undefined;
    if (typeof ResizeObserver === "undefined") return undefined;

    const containerElement = expandedBodyLayerRef.current;
    if (!(containerElement instanceof Element)) return undefined;

    const syncThumbToContainer = () => {
      if (imageExpandedById[expandedId]) return;

      // Keep drag interaction in control while pointer is active.
      if (imageDragStateRef.current.active && imageDragStateRef.current.noteId === expandedId) {
        return;
      }

      setImageThumbPosById((prev) => {
        const currentPosition = prev[expandedId];
        if (!currentPosition) return prev;

        const preferredPosition = imageThumbPreferredPosById[expandedId] ?? currentPosition;
        const bottomInset = getImageClampBottomInset(expandedId);
        const clampedPosition = clampThumbPosition(
          preferredPosition.x,
          preferredPosition.y,
          containerElement,
          bottomInset
        );

        if (!needsThumbReposition(currentPosition, clampedPosition)) {
          return prev;
        }

        return { ...prev, [expandedId]: clampedPosition };
      });
    };

    let rafId = 0;
    const observer = new ResizeObserver(() => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        syncThumbToContainer();
        rafId = 0;
      });
    });

    observer.observe(containerElement);
    syncThumbToContainer();

    return () => {
      observer.disconnect();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    clampThumbPosition,
    expandedId,
    expandedNote?.image_url,
    getImageClampBottomInset,
    imageExpandedById,
    imageThumbPreferredPosById,
    needsThumbReposition,
  ]);

  const openImageViewer = useCallback((url, alt, event) => {
    event.stopPropagation();
    if (!url) return;
    setImageViewer({ url, alt: alt || "Note image" });
  }, []);

  const handleDeleteImage = useCallback(
    async (noteId, imagePath, event) => {
      event.stopPropagation();
      updateNote(noteId, { image_url: "", image_path: "" });
      setImageExpandedById((prev) => {
        if (!prev[noteId]) return prev;
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      setImageThumbDraggingById((prev) => {
        if (!prev[noteId]) return prev;
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      setImageThumbPreferredPosById((prev) => {
        if (!prev[noteId]) return prev;
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      setImageThumbPosById((prev) => {
        if (!prev[noteId]) return prev;
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      closeImageViewer();

      try {
        await removeImageForNote(noteId, imagePath);
      } catch (deleteImageError) {
        console.error(deleteImageError);
      }
    },
    [closeImageViewer, removeImageForNote, updateNote]
  );

  const handleImageThumbPointerDown = useCallback(
    (noteId, event) => {
      if ("button" in event && event.button !== 0) return;
      event.stopPropagation();

      const containerElement = expandedBodyLayerRef.current;
      if (!(containerElement instanceof Element)) return;

      const currentPosition =
        imageThumbPosById[noteId] ??
        clampThumbPosition(
          Number.MAX_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER,
          containerElement,
          getImageClampBottomInset(noteId)
        );

      imageDragStateRef.current = {
        active: true,
        moved: false,
        noteId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: currentPosition.x,
        originY: currentPosition.y,
        suppressClick: false,
      };

      setImageThumbDraggingById((prev) => ({ ...prev, [noteId]: true }));
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [clampThumbPosition, getImageClampBottomInset, imageThumbPosById]
  );

  const handleImageThumbPointerMove = useCallback(
    (noteId, event) => {
      const dragState = imageDragStateRef.current;
      if (!dragState.active || dragState.noteId !== noteId || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.stopPropagation();

      const containerElement = expandedBodyLayerRef.current;
      if (!(containerElement instanceof Element)) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved && Math.abs(deltaX) + Math.abs(deltaY) > 3) {
        dragState.moved = true;
      }

      const nextPosition = clampThumbPosition(
        dragState.originX + deltaX,
        dragState.originY + deltaY,
        containerElement,
        getImageClampBottomInset(noteId)
      );

      setImageThumbPosById((prev) => {
        const currentPosition = prev[noteId];
        if (
          currentPosition &&
          currentPosition.x === nextPosition.x &&
          currentPosition.y === nextPosition.y
        ) {
          return prev;
        }
        return { ...prev, [noteId]: nextPosition };
      });
      setImageThumbPreferredPosById((prev) => {
        const currentPosition = prev[noteId];
        if (
          currentPosition &&
          currentPosition.x === nextPosition.x &&
          currentPosition.y === nextPosition.y
        ) {
          return prev;
        }
        return { ...prev, [noteId]: nextPosition };
      });
    },
    [clampThumbPosition, getImageClampBottomInset]
  );

  const finishImageThumbDrag = useCallback(
    (noteId, event, keepSuppressClick = false) => {
      const dragState = imageDragStateRef.current;
      if (!dragState.active || dragState.noteId !== noteId || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      const containerElement = expandedBodyLayerRef.current;
      const endClientX = typeof event.clientX === "number" ? event.clientX : dragState.startX;
      const endClientY = typeof event.clientY === "number" ? event.clientY : dragState.startY;
      if (containerElement instanceof Element) {
        const snappedPosition = snapThumbToNearestEdge(
          dragState.originX + (endClientX - dragState.startX),
          dragState.originY + (endClientY - dragState.startY),
          containerElement,
          getImageClampBottomInset(noteId)
        );

        setImageThumbPreferredPosById((prev) => ({ ...prev, [noteId]: snappedPosition }));

        // End drag first, then snap on next frame so CSS transition can animate the glide.
        setImageThumbDraggingById((prev) => ({ ...prev, [noteId]: false }));
        requestAnimationFrame(() => {
          setImageThumbPosById((prev) => ({ ...prev, [noteId]: snappedPosition }));
        });
      } else {
        setImageThumbDraggingById((prev) => ({ ...prev, [noteId]: false }));
      }

      imageDragStateRef.current = {
        ...dragState,
        active: false,
        suppressClick: keepSuppressClick && dragState.moved,
      };
    },
    [getImageClampBottomInset, snapThumbToNearestEdge]
  );

  const handleImageThumbPointerUp = useCallback(
    (noteId, event) => {
      finishImageThumbDrag(noteId, event, true);
    },
    [finishImageThumbDrag]
  );

  const handleImageThumbPointerCancel = useCallback(
    (noteId, event) => {
      finishImageThumbDrag(noteId, event, false);
    },
    [finishImageThumbDrag]
  );

  const handleImageThumbClick = useCallback((noteId, event) => {
    event.stopPropagation();

    if (imageDragStateRef.current.suppressClick) {
      imageDragStateRef.current = {
        ...imageDragStateRef.current,
        suppressClick: false,
      };
      return;
    }

    setImageExpandedById((prev) => ({ ...prev, [noteId]: true }));
  }, []);

  const visibleNotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return notes;
    }

    return notes.filter((note) => {
      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.summary.toLowerCase().includes(query)
      );
    });
  }, [notes, searchTerm]);

  const setCardWrapperRef = useCallback((id, element) => {
    if (element) {
      cardWrapperRefs.current.set(id, element);
      return;
    }
    cardWrapperRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(DESKTOP_MASONRY_QUERY);
    const handleChange = (event) => {
      setIsDesktopMasonryEnabled(event.matches);
    };

    setIsDesktopMasonryEnabled(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const applyMasonrySpan = useCallback((wrapper) => {
    if (!(wrapper instanceof HTMLElement)) return;

    if (!isDesktopMasonryEnabled) {
      wrapper.style.gridRowEnd = "auto";
      return;
    }

    const cardElement = wrapper.firstElementChild;
    const measureTarget =
      cardElement instanceof HTMLElement && !cardElement.classList.contains("expanded")
        ? cardElement
        : wrapper;
    const nextHeight = measureTarget.getBoundingClientRect().height;
    const nextSpan = Math.max(
      1,
      Math.ceil((nextHeight + MASONRY_GAP) / (MASONRY_ROW_HEIGHT + MASONRY_GAP))
    );

    wrapper.style.gridRowEnd = `span ${nextSpan}`;
  }, [isDesktopMasonryEnabled]);

  useLayoutEffect(() => {
    const wrappers = Array.from(cardWrapperRefs.current.values()).filter(
      (wrapper) => wrapper instanceof HTMLElement
    );

    if (!wrappers.length) return undefined;

    if (!isDesktopMasonryEnabled) {
      wrappers.forEach((wrapper) => {
        wrapper.style.gridRowEnd = "auto";
      });
      return undefined;
    }

    wrappers.forEach((wrapper) => applyMasonrySpan(wrapper));

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            entries.forEach((entry) => applyMasonrySpan(entry.target));
          })
        : null;

    wrappers.forEach((wrapper) => observer?.observe(wrapper));

    const handleResize = () => {
      wrappers.forEach((wrapper) => applyMasonrySpan(wrapper));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [applyMasonrySpan, isDesktopMasonryEnabled, visibleNotes, expandedId, isClosing]);

  const isTopClippedByNotesPanel = useCallback((cardElement) => {
    if (!(cardElement instanceof Element)) return false;

    const notesPanel = cardElement.closest(".notes-area");
    if (!(notesPanel instanceof Element)) return false;

    const cardRect = cardElement.getBoundingClientRect();
    const panelRect = notesPanel.getBoundingClientRect();

    // Block opening only when card is clipped at the top edge of notes panel.
    // Bottom clipping is intentionally allowed.
    return cardRect.top < panelRect.top + TOP_CLIP_GUARD_PX;
  }, []);

  const isTopClippedByHeaderOnMobile = useCallback((cardElement) => {
    if (!(cardElement instanceof Element)) return false;
    if (typeof window === "undefined") return false;
    if (window.innerWidth > 1024) return false; // only mobile/tablet

    const topbar = document.querySelector(".topbar");
    if (!(topbar instanceof Element)) return false;

    const cardRect = cardElement.getBoundingClientRect();
    const headerBottom = topbar.getBoundingClientRect().bottom;

    return cardRect.top < headerBottom + TOP_CLIP_GUARD_PX;
  }, []);

  const handleCardOpen = useCallback((id, event) => {
    if (expandedId) return;

    const cardElement = event.currentTarget;
    if (isTopClippedByNotesPanel(cardElement) || isTopClippedByHeaderOnMobile(cardElement)) {
      return;
    }

    expandCardHook(id);
  }, [expandedId, expandCardHook, isTopClippedByHeaderOnMobile, isTopClippedByNotesPanel]);

  useLayoutEffect(() => {
    const nextRects = new Map();

    visibleNotes.forEach((note) => {
      const wrapper = cardWrapperRefs.current.get(note.id);
      if (!wrapper) return;
      nextRects.set(note.id, wrapper.getBoundingClientRect());
    });

    if (!hasMeasuredLayoutRef.current) {
      previousWrapperRectsRef.current = nextRects;
      hasMeasuredLayoutRef.current = true;
      return;
    }

    // Avoid FLIP reflow animation while a card is opening/expanded/closing.
    // This prevents background jitter during the card transform animation.
    if (expandedId || isClosing || performance.now() < suppressWrapperFlipUntilRef.current) {
      previousWrapperRectsRef.current = nextRects;
      return;
    }

    nextRects.forEach((nextRect, id) => {
      const previousRect = previousWrapperRectsRef.current.get(id);
      if (!previousRect) return;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
        return;
      }

      const wrapper = cardWrapperRefs.current.get(id);
      if (!wrapper) return;

      const target = wrapper.firstElementChild instanceof HTMLElement ? wrapper.firstElementChild : wrapper;

      target.getAnimations?.().forEach((animation) => animation.cancel());
      target.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    });

    previousWrapperRectsRef.current = nextRects;
  }, [expandedId, isClosing, visibleNotes]);

  useEffect(() => {
    if (!expandedId) return;
    if (!expandedNote) closeCardHook();
  }, [closeCardHook, expandedId, expandedNote]);

  const clearRemoveReminderToggleTimer = useCallback(() => {
    if (removeReminderToggleTimerRef.current) {
      clearTimeout(removeReminderToggleTimerRef.current);
      removeReminderToggleTimerRef.current = null;
    }
  }, []);

  const scheduleRemoveReminderToggleHide = useCallback(
    (id) => {
      clearRemoveReminderToggleTimer();
      removeReminderToggleTimerRef.current = setTimeout(() => {
        setRemoveReminderToggleForId((current) => (current === id ? null : current));
        removeReminderToggleTimerRef.current = null;
      }, 2000);
    },
    [clearRemoveReminderToggleTimer]
  );

  useEffect(() => {
    return () => {
      clearRemoveReminderToggleTimer();
      if (recentlyClosedCardTimerRef.current) {
        clearTimeout(recentlyClosedCardTimerRef.current);
        recentlyClosedCardTimerRef.current = null;
      }
    };
  }, [clearRemoveReminderToggleTimer]);

  const closeCard = useCallback(() => {
    if (isClosing) {
      return;
    }

    if (expandedId) {
      setRecentlyClosedCardId(expandedId);
      if (recentlyClosedCardTimerRef.current) {
        clearTimeout(recentlyClosedCardTimerRef.current);
      }
      recentlyClosedCardTimerRef.current = setTimeout(() => {
        setRecentlyClosedCardId(null);
        recentlyClosedCardTimerRef.current = null;
      }, 900);
    }

    suppressWrapperFlipUntilRef.current = performance.now() + 280;
    closeCardHook();
    setMenuOpen(null);
    setMenuView("main");
    setRemoveReminderToggleForId(null);
    setReminderTimeDraftById({});
    setReminderEditorForId(null);
    setTextDraftById((prev) => {
      if (!expandedId || !prev[expandedId]) return prev;
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    setImageExpandedById((prev) => {
      if (!expandedId || !prev[expandedId]) return prev;
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    setImageThumbDraggingById((prev) => {
      if (!expandedId || !prev[expandedId]) return prev;
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    setImageThumbPreferredPosById((prev) => {
      if (!expandedId || !prev[expandedId]) return prev;
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    setImageThumbPosById((prev) => {
      if (!expandedId || !prev[expandedId]) return prev;
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    clearRemoveReminderToggleTimer();
  }, [
    clearRemoveReminderToggleTimer,
    closeCardHook,
    expandedId,
    isClosing,
  ]);

  const saveNote = useCallback(async () => {
    if (!expandedId) return;

    const draft = textDraftById[expandedId];
    const currentTitle = expandedNote?.title ?? "";
    const currentContent = expandedNote?.content ?? "";
    const nextUpdates = {};

    if (draft) {
      if (draft.title !== currentTitle) {
        nextUpdates.title = draft.title;
      }

      if (draft.content !== currentContent) {
        nextUpdates.content = draft.content;
      }
    }

    if (Object.keys(nextUpdates).length > 0) {
      updateNote(expandedId, nextUpdates);
    }

    await flushNote(expandedId);
    setTextDraftById((prev) => {
      const existingDraft = prev[expandedId];
      if (!existingDraft) return prev;

      return {
        ...prev,
        [expandedId]: {
          ...existingDraft,
          dirty: false,
        },
      };
    });
    closeCard();
  }, [closeCard, expandedId, expandedNote, flushNote, textDraftById, updateNote]);

  const handleSaveClick = useCallback((e) => {
    e.stopPropagation();

    if (ignoreNextSaveClickRef.current) {
      ignoreNextSaveClickRef.current = false;
      return;
    }

    void saveNote();
  }, [saveNote]);

  const handleSaveTouchEnd = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    ignoreNextSaveClickRef.current = true;
    window.setTimeout(() => {
      ignoreNextSaveClickRef.current = false;
    }, 350);
    void saveNote();
  }, [saveNote]);

  const discardNote = useCallback(async () => {
    if (expandedId) {
      await revertNote(expandedId);
    }
    closeCard();
  }, [closeCard, expandedId, revertNote]);

  const handleDelete = useCallback(async (id, e) => {
    e.stopPropagation();
    setMenuOpen(null);
    setMenuView("main");

    if (expandedId === id) {
      closeCard();
    }

    await deleteNote(id);
  }, [expandedId, closeCard, deleteNote]);

  const handleTagSelect = useCallback(
    async (noteId, tone, e) => {
      e?.stopPropagation();
      setMenuOpen(null);
      setMenuView("main");

      updateNote(noteId, { tag_color: tone });
      await flushNote(noteId);
    },
    [flushNote, updateNote]
  );

  const handleArchiveToggle = useCallback(async (note, e) => {
    e.stopPropagation();
    setMenuOpen(null);
    setMenuView("main");

    const willArchive = !note.archived;

    if (expandedId === note.id && willArchive) {
      closeCard();
    }

    await archiveNote(note.id, willArchive);
  }, [archiveNote, closeCard, expandedId]);

  const handleSummarize = useCallback(
    async (id, promptOrDefault = "", e, allowDefault = true) => {
      e?.stopPropagation?.();

      const promptValue = (promptOrDefault || "").trim();
      const effectivePrompt = promptValue || (allowDefault ? DEFAULT_AI_PROMPT : "");

      setSummaryVisibilityById((prev) => ({ ...prev, [id]: true }));
      setMenuOpen(null);
      setMenuView("main");
      await summarizeNote(id, effectivePrompt);
    },
    [summarizeNote]
  );

  const handlePromptSubmit = useCallback(
    (id, prompt = "", e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      // Prompt comes directly from AISummary now
      void handleSummarize(id, prompt, e, false);
    },
    [handleSummarize]
  );

  const handleRemoveReminderHoverStart = useCallback((id, e) => {
    e.stopPropagation();
    clearRemoveReminderToggleTimer();
    setRemoveReminderToggleForId(id);
  }, [clearRemoveReminderToggleTimer]);

  const handleRemoveReminderHoverEnd = useCallback((id, e) => {
    e.stopPropagation();
    scheduleRemoveReminderToggleHide(id);
  }, [scheduleRemoveReminderToggleHide]);

  const handleToggleSummaryVisibility = useCallback((id, e) => {
    e.stopPropagation();
    setSummaryVisibilityById((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const handleUploadClick = useCallback((e) => {
    e.stopPropagation();
    expandedUploadInputRef.current?.click();
  }, []);

  const focusReminderInput = useCallback(() => {
    reminderInputRef.current?.focus();
    reminderInputRef.current?.showPicker?.();
  }, []);

  const handleReminderAction = useCallback((note, event) => {
    event.stopPropagation();
    setMenuOpen(null);
    setMenuView("main");

    setPendingReminderFocusId(note.id);
    setReminderEditorForId(note.id);

    if (expandedId === note.id) {
      requestAnimationFrame(() => {
        focusReminderInput();
      });
      return;
    }

    expandCardHook(note.id);
  }, [expandCardHook, expandedId, focusReminderInput]);

  const handleRemoveReminder = useCallback((noteId, event) => {
    event.stopPropagation();
    setMenuOpen(null);
    setMenuView("main");
    setRemoveReminderToggleForId(null);
    clearRemoveReminderToggleTimer();
    updateNote(noteId, { reminder_at: null, label: "" });
    setReminderTimeDraftById((drafts) => {
      const nextDrafts = { ...drafts };
      delete nextDrafts[noteId];
      return nextDrafts;
    });
  }, [clearRemoveReminderToggleTimer, updateNote]);

  useEffect(() => {
    if (pendingReminderFocusId !== expandedId || !expandedId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusReminderInput();
      setPendingReminderFocusId(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [expandedId, focusReminderInput, pendingReminderFocusId]);

  const handleImageSelected = useCallback(
    async (noteId, event) => {
      const [file] = event.target.files ?? [];
      if (!file) return;

      const currentNote = notes.find((item) => item.id === noteId);
      const previousPath = currentNote?.image_path ?? "";

      try {
        const { publicUrl, storagePath } = await uploadImageForNote(noteId, file, previousPath);
        updateNote(noteId, { image_url: publicUrl, image_path: storagePath });
      } catch (uploadError) {
        console.error(uploadError);
      } finally {
        event.target.value = "";
      }
    },
    [notes, updateNote, uploadImageForNote]
  );

  useEffect(() => {
    const handler = (e) => {
      if (isImageViewerOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeImageViewer();
          return;
        }

        return;
      }

      if (e.key === "Escape") closeCard();
      if (e.shiftKey && e.key === "Enter" && expandedId) {
        e.preventDefault();
        saveNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && expandedId) {
        e.preventDefault();
        saveNote();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    closeCard,
    closeImageViewer,
    expandedId,
    isImageViewerOpen,
    saveNote,
  ]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleOutsideMenuClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest(".note-menu") || target.closest(".note-menu-btn")) {
        return;
      }

      setMenuOpen(null);
      setMenuView("main");
    };

    document.addEventListener("mousedown", handleOutsideMenuClick);
    document.addEventListener("touchstart", handleOutsideMenuClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideMenuClick);
      document.removeEventListener("touchstart", handleOutsideMenuClick);
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <section className="notes-wrapper">
        <div className="notes-status">Loading your notes...</div>
      </section>
    );
  }

  if (!visibleNotes.length) {
    return (
      <section className="notes-wrapper">
        {error ? <div className="notes-status notes-status-error">{error}</div> : null}
        <div className="notes-status">
          {searchTerm ? "No notes match your search." : emptyLabel}
        </div>
      </section>
    );
  }

  return (
    <>
      {overlay && React.cloneElement(overlay, { onClick: closeCard })}

      <section className="notes-wrapper">
        {error ? <div className="notes-status notes-status-error">{error}</div> : null}
        <div className="notes-scroll">
          <div className={`notes-grid${isDesktopMasonryEnabled ? "" : " notes-grid-simple"}`}>
            {visibleNotes.map((note, index) => {
              const isExpanded = expandedId === note.id;
              const isSyncing = Boolean(savingById[note.id]);
              const isSummarizing = Boolean(summarizingById[note.id]);
              const tagTone = (note.tag_color || "").toLowerCase();
              const hasTag = Boolean(tagTone);
              const reminderLabel = formatReminderLabel(note.reminder_at);
              const showReminderEditor = reminderEditorForId === note.id;
              const showRemoveReminderToggle = Boolean(note.reminder_at) && removeReminderToggleForId === note.id;
              const isSummaryVisible = summaryVisibilityById[note.id] ?? true;
              const hasAiOutput = Boolean((expandedNote?.summary ?? "").trim());
              const displayTitle = getCollapsedDisplayTitle(note.title);
              const reminderChipLabel = formatReminderChipLabel(note.reminder_at);
              const reminderLabelText = (note.label || "").trim();
              const reminderHoverText = reminderLabelText
                ? [reminderLabelText, reminderLabel].filter(Boolean).join(" — ")
                : reminderLabel
                ? `Reminder: ${reminderLabel}`
                : "Reminder";
              const reminderTimeDraft = reminderTimeDraftById[note.id];
              const textDraft = textDraftById[note.id];
              const draftTitle = textDraft?.title ?? expandedNote?.title ?? note.title ?? "";
              const draftContent = textDraft?.content ?? expandedNote?.content ?? note.content ?? "";
              const imageThumbPosition = imageThumbPosById[note.id];
              const isImageExpanded = Boolean(imageExpandedById[note.id]);
              const isImageThumbDragging = Boolean(imageThumbDraggingById[note.id]);
              const isAiCollapsed = true; // AI box state now managed by AISummary hook
              const aiOverlayReserve = getImageClampBottomInset(note.id);
              const nowReminder = getCurrentReminderDateTime();
              const existingReminderIso = expandedNote?.reminder_at || note.reminder_at || "";
              const hasExistingReminder = Boolean(existingReminderIso);
              const fallbackReminder = hasExistingReminder ? null : nowReminder;
              const baseReminderIso =
                existingReminderIso || fallbackReminder?.isoValue || "";
              const reminderDateValue = isoToReminderDate(baseReminderIso);
              const reminderTimeValue = reminderTimeDraft ?? isoToReminderTime(baseReminderIso);
              const reminderDateMin = nowReminder.dateValue;
              const reminderTimeMin =
                reminderDateValue === nowReminder.dateValue ? nowReminder.timeValue : "";
              const showCollapsed = !isExpanded;
              const showExpanded = isExpanded && !isClosing;

              const collapsedClass = recentlyClosedCardId === note.id
                ? "card-collapsed quick-fade-in"
                : "card-collapsed";
              const expandedClass = isExpanded && isOpening
                ? "card-expanded fade-in-open"
                : "card-expanded fade-in";

              return (
                <div
                  key={note.id}
                  className="note-card-wrapper"
                  ref={(element) => setCardWrapperRef(note.id, element)}
                  style={{
                    ...(isExpanded ? placeholderStyle : {}),
                    order: index, // keep original order even when layout recalculates
                  }}
                >
                  <div
                    ref={(el) => setCardRef(note.id, el)}
                    className={`note-card${isExpanded ? " expanded" : ""}`}
                    style={isExpanded ? cardStyle : {}}
                    onClick={(event) => handleCardOpen(note.id, event)}
                  >
                    {!isExpanded && (
                      <span
                        className={`collapsed-date-chip${recentlyClosedCardId === note.id ? " quick-fade-in" : ""}`}
                      >
                        {formatNoteDate(note.updated_at)}
                      </span>
                    )}
                    {/* ── Collapsed UI ── */}
                    {showCollapsed && (
                      <div className={collapsedClass}>
                        <div className="card-collapsed-body">
                          <div className="note-header">
                            <div className="note-title-row">
                              <AnimatedCollapsedText
                                as="h3"
                                className="note-title"
                                text={displayTitle}
                                animate={false}
                                cycle={0}
                              />
                              {hasTag ? (
                                <span
                                  className={`note-tag-chip tag-tone-${tagTone}`}
                                  aria-label={`${tagTone} tag`}
                                >
                                  <span className="note-tag-dot" aria-hidden="true" />
                                </span>
                              ) : null}
                            </div>
                            {!isExpanded && (
                              <CardMenu
                                isOpen={menuOpen === note.id}
                                showTags={menuView === "tags"}
                                isSummaryVisible={isSummaryVisible}
                                showRemoveReminderToggle={showRemoveReminderToggle}
                                isArchived={note.archived}
                                activeTag={tagTone}
                                onToggle={() => {
                                  setMenuOpen((currentMenuId) => (currentMenuId === note.id ? null : note.id));
                                  setMenuView("main");
                                }}
                                onReminder={(e) => {
                                  handleReminderAction(note, e);
                                }}
                                onRemoveReminder={(e) => handleRemoveReminder(note.id, e)}
                                onRemoveReminderHoverStart={(e) => handleRemoveReminderHoverStart(note.id, e)}
                                onRemoveReminderHoverEnd={(e) => handleRemoveReminderHoverEnd(note.id, e)}
                                onToggleSummaryVisibility={(e) => {
                                  handleToggleSummaryVisibility(note.id, e);
                                }}
                                onArchive={(e) => { void handleArchiveToggle(note, e); }}
                                onSelectTag={(tone) => { void handleTagSelect(note.id, tone); }}
                                onOpenTags={() => {
                                  setMenuView("tags");
                                }}
                                onBack={() => {
                                  setMenuView("main");
                                }}
                                onDelete={(e) => {
                                  void handleDelete(note.id, e);
                                }}
                              />
                            )}
                          </div>
                          {note.image_url ? (
                            <div className="note-image-box">
                              <img
                                src={note.image_url}
                                alt={note.title || "Note image"}
                                className="note-image"
                                loading="lazy"
                              />
                            </div>
                          ) : null}
                          <div className="note-preview-box">
                            <AnimatedCollapsedText
                              as="p"
                              className="note-preview"
                              text={note.content}
                              animate={false}
                              cycle={0}
                            />
                          </div>
                          {reminderChipLabel ? (
                            <div className="note-reminder-chip" title={reminderHoverText}>
                              <ReminderIcon className="note-reminder-icon" />
                              <span className="note-reminder-text">{reminderChipLabel}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}

                    {/* ── Expanded UI ── */}
                    {showExpanded && (
                      <div className={expandedClass}>
                        {/* Header row */}
                        <div className="exp-header">
                          <span className="exp-date">{formatNoteDate(note.updated_at)}</span>
                          <span className={`note-sync-status${isSummarizing || isSyncing ? " syncing" : ""}`}>
                            {isSummarizing
                              ? "Summarizing..."
                              : isSyncing
                              ? "Saving changes..."
                              : "All changes synced"}
                          </span>
                          <CardMenu
                            isOpen={menuOpen === note.id}
                            showTags={menuView === "tags"}
                            isSummaryVisible={isSummaryVisible}
                            showRemoveReminderToggle={showRemoveReminderToggle}
                            isArchived={note.archived}
                            activeTag={tagTone}
                            onToggle={() => {
                              setMenuOpen((currentMenuId) => (currentMenuId === note.id ? null : note.id));
                              setMenuView("main");
                            }}
                            onReminder={(e) => {
                              handleReminderAction(note, e);
                            }}
                            onRemoveReminder={(e) => handleRemoveReminder(note.id, e)}
                            onRemoveReminderHoverStart={(e) => handleRemoveReminderHoverStart(note.id, e)}
                            onRemoveReminderHoverEnd={(e) => handleRemoveReminderHoverEnd(note.id, e)}
                            onToggleSummaryVisibility={(e) => {
                              handleToggleSummaryVisibility(note.id, e);
                            }}
                            onArchive={(e) => { void handleArchiveToggle(note, e); }}
                            onSelectTag={(tone) => { void handleTagSelect(note.id, tone); }}
                            onOpenTags={() => {
                              setMenuView("tags");
                            }}
                            onBack={() => {
                              setMenuView("main");
                            }}
                            onDelete={(e) => {
                              void handleDelete(note.id, e);
                            }}
                          />
                        </div>

                        {/* Editable title */}
                        <input
                          className="edit-title"
                          value={draftTitle}
                          onChange={(e) => {
                            const nextTitle = e.target.value;
                            setTextDraftById((drafts) => {
                              const existingDraft = drafts[note.id] ?? {
                                title: expandedNote?.title ?? note.title ?? "",
                                content: expandedNote?.content ?? note.content ?? "",
                                dirty: false,
                              };

                              return {
                                ...drafts,
                                [note.id]: {
                                  ...existingDraft,
                                  title: nextTitle,
                                  dirty: true,
                                },
                              };
                            });
                          }}
                          placeholder="Title…"
                          onClick={(e) => e.stopPropagation()}
                        />

                        {showReminderEditor ? (
                          <label className="note-reminder-field" onClick={(e) => e.stopPropagation()}>
                            <div className="note-reminder-header">
                              <span className="note-reminder-label">Reminder date</span>
                              <button
                                type="button"
                                className="note-reminder-close"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReminderEditorForId((current) =>
                                    current === note.id ? null : current
                                  );
                                }}
                              >
                                Close
                              </button>
                            </div>
                            <div className="note-reminder-controls">
                              <input
                                ref={reminderInputRef}
                                type="date"
                                className="note-reminder-input"
                                value={reminderDateValue}
                                min={reminderDateMin}
                                onChange={(e) => {
                                  const nextDate = e.target.value;
                                  if (!nextDate) {
                                    updateNote(note.id, { reminder_at: null });
                                    setReminderTimeDraftById((drafts) => {
                                      const nextDrafts = { ...drafts };
                                      delete nextDrafts[note.id];
                                      return nextDrafts;
                                    });
                                    return;
                                  }

                                  const currentTime = reminderTimeValue;
                                  const nextReminderAt = reminderDateTimeToIso(nextDate, currentTime);
                                  const hadReminder = Boolean(expandedNote?.reminder_at);
                                  const updatedNote = updateNote(note.id, { reminder_at: nextReminderAt });
                                  setReminderTimeDraftById((drafts) => {
                                    const nextDrafts = { ...drafts };
                                    delete nextDrafts[note.id];
                                    return nextDrafts;
                                  });

                                  if (updatedNote && !hadReminder && nextReminderAt) {
                                    onReminderAssigned(note.id);
                                  }
                                }}
                              />
                              <input
                                type="time"
                                className="note-reminder-input"
                                value={reminderTimeValue}
                                min={reminderTimeMin || undefined}
                                onChange={(e) => {
                                  const rawTime = e.target.value;
                                  setReminderTimeDraftById((drafts) => ({ ...drafts, [note.id]: rawTime }));

                                  if (!rawTime) {
                                    updateNote(note.id, { reminder_at: null });
                                    return;
                                  }

                                  if (rawTime.length === 5) {
                                    const currentDate = reminderDateValue || "";
                                    if (!currentDate) return;
                                    const nextReminderAt = reminderDateTimeToIso(currentDate, rawTime);
                                    updateNote(note.id, {
                                      reminder_at: nextReminderAt || null,
                                    });
                                    setReminderTimeDraftById((drafts) => {
                                      const nextDrafts = { ...drafts };
                                      delete nextDrafts[note.id];
                                      return nextDrafts;
                                    });
                                  }
                                }}
                                onBlur={() => {
                                  const draft = reminderTimeDraftById[note.id];
                                  if (draft && draft.length !== 5) {
                                    setReminderTimeDraftById((drafts) => {
                                      const nextDrafts = { ...drafts };
                                      delete nextDrafts[note.id];
                                      return nextDrafts;
                                    });
                                  }
                                }}
                              />
                              <input
                                type="text"
                                className="note-reminder-input note-reminder-label-input"
                                placeholder="Add label (optional)"
                                value={expandedNote?.label ?? ""}
                                onChange={(e) => {
                                  updateNote(note.id, { label: e.target.value });
                                }}
                                maxLength={120}
                              />
                            </div>
                          </label>
                        ) : null}

                        {/* Editable body */}
                        <div
                          className="edit-body-layer"
                          ref={isExpanded ? expandedBodyLayerRef : null}
                          style={
                            aiOverlayReserve
                              ? { "--ai-overlay-reserve": `${aiOverlayReserve}px` }
                              : undefined
                          }
                        >
                          <textarea
                            className={`edit-body${isSummaryVisible ? " has-ai-overlay" : ""}`}
                            value={draftContent}
                            onChange={(e) => {
                              const nextContent = e.target.value;
                              setTextDraftById((drafts) => {
                                const existingDraft = drafts[note.id] ?? {
                                  title: expandedNote?.title ?? note.title ?? "",
                                  content: expandedNote?.content ?? note.content ?? "",
                                  dirty: false,
                                };

                                return {
                                  ...drafts,
                                  [note.id]: {
                                    ...existingDraft,
                                    content: nextContent,
                                    dirty: true,
                                  },
                                };
                              });
                            }}
                            placeholder="Start writing…"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {note.image_url && !isImageExpanded ? (
                            <div
                              className={`exp-image-thumb-floating${isImageThumbDragging ? " is-dragging" : ""}`}
                              style={
                                imageThumbPosition
                                  ? { left: `${imageThumbPosition.x}px`, top: `${imageThumbPosition.y}px` }
                                  : {
                                      right: `${IMAGE_THUMB_MARGIN}px`,
                                      bottom: `${Math.max(IMAGE_THUMB_MARGIN, aiOverlayReserve + IMAGE_THUMB_MARGIN)}px`,
                                    }
                              }
                              role="button"
                              tabIndex={0}
                              aria-label="Open note image"
                              onClick={(e) => handleImageThumbClick(note.id, e)}
                              onPointerDown={(e) => handleImageThumbPointerDown(note.id, e)}
                              onPointerMove={(e) => handleImageThumbPointerMove(note.id, e)}
                              onPointerUp={(e) => handleImageThumbPointerUp(note.id, e)}
                              onPointerCancel={(e) => handleImageThumbPointerCancel(note.id, e)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setImageExpandedById((prev) => ({ ...prev, [note.id]: true }));
                                }
                              }}
                            >
                              <img
                                src={note.image_url}
                                alt={note.title || "Note image"}
                                className="exp-image-thumb-image"
                                draggable={false}
                              />
                            </div>
                          ) : null}

                          {isSummaryVisible && (
                            <AISummary
                              noteId={note.id}
                              isSummarizing={isSummarizing}
                              summaryText={expandedNote?.summary ?? ""}
                              onClickSummaryButton={handleSummarize}
                              onSubmit={(id, prompt, e) => handlePromptSubmit(id, prompt, e)}
                              onApply={(id, summaryText) => {
                                if (!summaryText.trim() || isSummarizing) return;
                                setTextDraftById((drafts) => {
                                  const existingDraft = drafts[id] ?? {
                                    title: expandedNote?.title ?? note.title ?? "",
                                    content: expandedNote?.content ?? note.content ?? "",
                                    dirty: false,
                                  };

                                  return {
                                    ...drafts,
                                    [id]: {
                                      ...existingDraft,
                                      content: summaryText,
                                      dirty: true,
                                    },
                                  };
                                });
                              }}
                              hasOutput={hasAiOutput}
                              overlay
                              rootRef={(element) => setAiOverlayRef(note.id, element)}
                            />
                          )}

                          {note.image_url && isImageExpanded ? (
                            <div
                              className="note-image-box exp-image-box exp-image-box-overlay"
                              style={{ "--expanded-image-bottom-inset": `${aiOverlayReserve}px` }}
                            >
                              <div className="exp-image-controls">
                                <button
                                  type="button"
                                  className="exp-image-action-btn exp-image-action-btn-zoom"
                                  onClick={(e) => openImageViewer(note.image_url, note.title || "Note image", e)}
                                  aria-label="Zoom image"
                                />
                                <button
                                  type="button"
                                  className="exp-image-action-btn exp-image-action-btn-delete"
                                  onClick={(e) => { void handleDeleteImage(note.id, note.image_path, e); }}
                                  aria-label="Delete image"
                                />
                              </div>
                              <div
                                className="exp-image-frame exp-image-frame-clickable"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImageExpandedById((prev) => ({ ...prev, [note.id]: false }));
                                }}
                              >
                                <img
                                  src={note.image_url}
                                  alt={note.title || "Note image"}
                                  className="note-image note-image-expanded"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="exp-footer">
                          <input
                            ref={expandedUploadInputRef}
                            type="file"
                            accept="image/*"
                            className="exp-upload-input"
                            onChange={(e) => handleImageSelected(note.id, e)}
                          />
                          <div className="exp-footer-left">
                            <button type="button" className="exp-btn-upload" onClick={handleUploadClick}>
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M12 16V5" />
                                <path d="m7 10 5-5 5 5" />
                                <path d="M5 19h14" />
                              </svg>
                              Upload image
                            </button>
                          </div>
                          <div className="exp-footer-actions">
                            <button className="close-btn" onClick={(e) => { e.stopPropagation(); void discardNote(); }}>
                              Discard
                            </button>
                            <button className="save-btn" onClick={handleSaveClick} onTouchEnd={handleSaveTouchEnd}>
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {isImageViewerOpen && imageViewer && (
        <div className="image-viewer-overlay" onClick={closeImageViewer}>
          <img
            src={imageViewer.url}
            alt={imageViewer.alt}
            className="image-viewer-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
