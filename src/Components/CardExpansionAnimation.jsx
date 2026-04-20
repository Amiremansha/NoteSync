import { useState, useRef, useCallback, useEffect } from "react";
import "./CardExpansionAnimation.css"
import "./Mobile_Opt/CardExpansionAnimationMobile.css"
;

// ─── Tuning ───────────────────────────────────────────────────────────────────
const DESKTOP_GAP = 48;
const OPEN_DURATION = 430;
const CLOSE_DURATION = 340;
const CORNER_CARD_SLOWDOWN = 1.38; // Increase this to make corner cards slower; 1 = no corner slowdown.
const CARD_RADIUS = "20px";
const OPEN_EASING = "cubic-bezier(0.52, 1.2, 0.25, 1.02)";
const CLOSE_EASING = "cubic-bezier(0.55, 1.1, 0.48, 1.05)";
const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0px) scale(1, 1)";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function getCornerFactor(rect) {
  const viewportCenterX = window.innerWidth / 2;
  const viewportCenterY = window.innerHeight / 2;
  const cardCenterX = rect.left + rect.width / 2;
  const cardCenterY = rect.top + rect.height / 2;
  const horizontalEdge = clamp(Math.abs(cardCenterX - viewportCenterX) / viewportCenterX, 0, 1);
  const verticalEdge = clamp(Math.abs(cardCenterY - viewportCenterY) / viewportCenterY, 0, 1);

  return Math.sqrt(horizontalEdge * verticalEdge);
}

function getCornerAdjustedDuration(rect, baseDuration) {
  const cornerFactor = getCornerFactor(rect);
  const slowdown = 1 + cornerFactor * (CORNER_CARD_SLOWDOWN - 1);

  return Math.round(baseDuration * slowdown);
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

// Flush pending styles before transition starts — prevents jitter on far cards
function forceReflow(el) {
  void el.getBoundingClientRect();
}

function getFlipMetrics(fromRect, toRect) {
  const fromWidth = Math.max(1, fromRect.width || 0);
  const fromHeight = Math.max(1, fromRect.height || 0);
  const toWidth = Math.max(1, toRect.width || 0);
  const toHeight = Math.max(1, toRect.height || 0);
  const translateX = Math.round(fromRect.left - toRect.left);
  const translateY = Math.round(fromRect.top - toRect.top);
  const scaleX = fromWidth / toWidth;
  const scaleY = fromHeight / toHeight;

  return {
    translateX,
    translateY,
    scaleX,
    scaleY,
    transform: `translate3d(${translateX}px, ${translateY}px, 0px) scale(${scaleX}, ${scaleY})`,
  };
}

export function useCardExpansion() {
  const [expandedId,       setExpandedId]       = useState(null);
  const [cardDuration,     setCardDuration]     = useState(400);
  const [isOpening,        setIsOpening]        = useState(false);
  const [isClosing,        setIsClosing]        = useState(false);
  const [cardStyle,        setCardStyle]        = useState({});
  const [placeholderStyle, setPlaceholderStyle] = useState({});

  const cardRefs      = useRef({});
  const phaseRef      = useRef("idle");
  const timers        = useRef([]);
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
    setPlaceholderStyle({});
    phaseRef.current = "idle";
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Expand from a note card ───────────────────────────────────────────────
  const expandCard = useCallback((id) => {
    const phase = phaseRef.current;
    if (phase === "opening") return;
    if (phase === "open")    return;
    if (phase === "closing") { clearTimers(); fullReset(); }

    const card = cardRefs.current[id];
    if (!card) return;

    const wrapper = card.parentElement;
    if (!wrapper) return;

    const rect    = wrapper.getBoundingClientRect();
    const target  = getExpandedRect();
    const dur     = getCornerAdjustedDuration(rect, OPEN_DURATION);
    const fromSourceMetrics = getFlipMetrics(rect, target);
    const sourceRadius = window.getComputedStyle(card).borderRadius || "8px";
    sourceRadiusById.current[id] = sourceRadius;

    setCardDuration(dur);
    phaseRef.current = "opening";
    setIsOpening(true);

    setPlaceholderStyle({ width: rect.width, height: rect.height });
    setExpandedId(id);
    setIsClosing(false);

    setCardStyle({
      top: target.top,
      left: target.left,
      width: target.width,
      height: target.height,
      transformOrigin: "top left",
      transform: fromSourceMetrics.transform,
      transition: "none",
      "--card-duration": `${dur}ms`,
      "--card-easing": OPEN_EASING,
      "--source-radius": sourceRadius,
      "--border-scale-x": `${1 / fromSourceMetrics.scaleX}`,
      "--border-scale-y": `${1 / fromSourceMetrics.scaleY}`,
    });

    requestAnimationFrame(() => {
      forceReflow(card);
      requestAnimationFrame(() => {
        setCardStyle({
          ...target,
          transformOrigin: "top left",
          transform: IDENTITY_TRANSFORM,
          "--card-duration": `${dur}ms`,
          "--card-easing": OPEN_EASING,
          "--source-radius": CARD_RADIUS,
          "--border-scale-x": "1",
          "--border-scale-y": "1",
        });
        after(() => {
          phaseRef.current = "open";
          setIsOpening(false);
        }, dur + 30);
      });
    });
  }, [after, clearTimers, fullReset]);

  // ── Close expanded note card ───────────────────────────────────────────────
  const closeCard = useCallback(() => {
    const phase = phaseRef.current;
    if (phase !== "open" && phase !== "opening") return;
    clearTimers();

    const id = expandedId;
    const card = cardRefs.current[id];
    const sourceRect = card?.parentElement?.getBoundingClientRect();
    if (!card || !sourceRect) {
      fullReset();
      return;
    }

    const liveRect = card.getBoundingClientRect();
    const dur = getCornerAdjustedDuration(sourceRect, CLOSE_DURATION);
    const endRadius = sourceRadiusById.current[id] || "8px";

    phaseRef.current = "closing";
    setIsOpening(false);
    setIsClosing(true);
    setCardDuration(dur);

    // Start at the live visual position, but with FLIP transform applied
    const flip = getFlipMetrics(liveRect, sourceRect);

    setCardStyle({
      top: sourceRect.top,
      left: sourceRect.left,
      width: sourceRect.width,
      height: sourceRect.height,
      transformOrigin: "top left",
      transform: flip.transform,
      transition: "none",
      "--card-duration": `${dur}ms`,
      "--card-easing": CLOSE_EASING,
      "--source-radius": CARD_RADIUS,
      "--border-scale-x": `${1 / flip.scaleX}`,
      "--border-scale-y": `${1 / flip.scaleY}`,
    });

    requestAnimationFrame(() => {
      setCardStyle({
        top: sourceRect.top,
        left: sourceRect.left,
        width: sourceRect.width,
        height: sourceRect.height,
        transformOrigin: "top left",
        transform: IDENTITY_TRANSFORM,
        transition: `transform ${dur}ms ${CLOSE_EASING}, border-radius ${dur}ms ${CLOSE_EASING}`,
        "--card-duration": `${dur}ms`,
        "--card-easing": CLOSE_EASING,
        "--source-radius": endRadius,
        "--border-scale-x": "1",
        "--border-scale-y": "1",
      });

      after(() => {
        fullReset();
      }, dur + 24);
    });
  }, [expandedId, after, clearTimers, fullReset]);

  const overlay = expandedId
    ? (
      <div
        className={`overlay${isClosing ? " closing" : ""}`}
        style={{ "--card-duration": `${cardDuration}ms` }}
        onClick={closeCard}
      />
    )
    : null;

  return {
    expandedId, isOpening, isClosing,
    cardStyle, placeholderStyle,
    setCardRef, expandCard, closeCard, overlay,
  };
}
