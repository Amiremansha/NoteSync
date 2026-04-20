import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAISummary } from "../hooks/useAISummary";
import "./AISummary.css";
import "./Mobile_Opt/AISummaryMobile.css";

function AnimatedSummaryContent({
  isSummarizing = false,
  text = "",
  placeholder = "",
  heightCap = null,
  minHeight = 0,
}) {
  const measureRef = useRef(null);
  const wasSummarizingRef = useRef(isSummarizing);
  const [maxHeight, setMaxHeight] = useState(minHeight);
  const [isFadingOutLoader, setIsFadingOutLoader] = useState(false);
  const [wordAnimationSeed, setWordAnimationSeed] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let timerId = null;

    if (wasSummarizingRef.current && !isSummarizing) {
      frameId = window.requestAnimationFrame(() => {
        setIsFadingOutLoader(true);
        setWordAnimationSeed((seed) => seed + 1);
      });
      timerId = window.setTimeout(() => setIsFadingOutLoader(false), 560);
      wasSummarizingRef.current = isSummarizing;
      return () => {
        window.cancelAnimationFrame(frameId);
        if (timerId) window.clearTimeout(timerId);
      };
    }

    if (!isSummarizing && text && !wasSummarizingRef.current) {
      frameId = window.requestAnimationFrame(() => {
        setWordAnimationSeed((seed) => seed + 1);
      });
    }

    wasSummarizingRef.current = isSummarizing;

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [isSummarizing, text]);

  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) return undefined;

    let rafId = 0;
    const updateHeight = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const nextHeight = element.scrollHeight;
        setMaxHeight((currentHeight) => {
          const boundedNext = typeof heightCap === "number" ? Math.min(nextHeight, heightCap) : nextHeight;
          const boundedCurrent = typeof heightCap === "number" ? Math.min(currentHeight, heightCap) : currentHeight;
          const safeNext = Math.max(minHeight, boundedNext || minHeight);
          return Math.abs(boundedCurrent - safeNext) > 0.5 ? safeNext : boundedCurrent;
        });
      });
    };

    updateHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateHeight) : null;
    observer?.observe(element);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      cancelAnimationFrame(rafId);
    };
  }, [heightCap, isFadingOutLoader, isSummarizing, minHeight, text, wordAnimationSeed]);

  const showLoader = isSummarizing || isFadingOutLoader;
  const wordTokens = useMemo(() => (typeof text === "string" ? text.split(/(\s+)/) : []), [text]);
  const displayHeight = typeof heightCap === "number" ? Math.min(maxHeight, heightCap) : maxHeight;
  const finalHeight = Math.max(minHeight, displayHeight);

  return (
    <div className="note-summary-content-wrap" style={{ maxHeight: `${finalHeight}px` }}>
      <div ref={measureRef} className="note-summary-content-shell">
        {showLoader ? <div className={`note-summary-loading-field${!isSummarizing ? " is-fading-out" : ""}`} /> : null}
        {isSummarizing ? <div className="note-summary-loading-spacer" /> : null}

        {!isSummarizing && text ? (
          <p className="note-summary-content" key={`summary-${wordAnimationSeed}`}>
            {wordTokens.map((token, index) =>
              !token || /^\s+$/.test(token) ? (
                token
              ) : (
                <span
                  key={`${wordAnimationSeed}-${index}`}
                  className="note-summary-word"
                  style={{ animationDelay: `${Math.min(index * 26, 950)}ms` }}
                >
                  {token}
                </span>
              )
            )}
          </p>
        ) : null}

        {!isSummarizing && !text && placeholder ? <p className="note-summary-placeholder">{placeholder}</p> : null}
      </div>
    </div>
  );
}

function AISummary({
  noteId,
  isSummarizing,
  summaryText,
  onClickSummaryButton,
  onSubmit,
  onApply,
  hasOutput,
  overlay = false,
  rootRef = null,
}) {
  // Use the AI Summary hook to manage all AI box state locally
  const aiSummary = useAISummary();
  
  // Get current values from hook
  const promptValue = aiSummary.getPrompt(noteId);
  const effectiveCollapsed = aiSummary.getIsAiCollapsed(noteId);
  const [showCollapsedActions, setShowCollapsedActions] = useState(effectiveCollapsed);

  // Handler for prompt changes
  const handlePromptChange = (newValue) => {
    aiSummary.setPrompt(noteId, newValue);
  };

  // Handler for toggle collapse
  const handleToggleCollapse = (e) => {
    e.stopPropagation();
    aiSummary.toggleCollapse(noteId);
  };

  // Auto-expand when API starts processing (isSummarizing becomes true)
  useEffect(() => {
    if (isSummarizing && effectiveCollapsed) {
      aiSummary.toggleCollapse(noteId);
    }
  }, [isSummarizing, noteId, effectiveCollapsed, aiSummary]);

  useEffect(() => {
    let frameId = 0;

    if (!effectiveCollapsed) {
      frameId = window.requestAnimationFrame(() => {
        setShowCollapsedActions(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const timer = window.setTimeout(() => {
      setShowCollapsedActions(true);
    }, 170);

    return () => window.clearTimeout(timer);
  }, [effectiveCollapsed]);

  return (
    <section
      ref={rootRef}
      className={`note-ai-pill ${hasOutput ? "has-output" : ""} ${effectiveCollapsed ? "is-collapsed" : ""}${overlay ? " is-overlay" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {showCollapsedActions && (
        <div className="note-ai-actions">
          <button
            type="button"
            className="note-ai-chip"
            onClick={(e) => {
              e.stopPropagation();
              // Only allow button if input is empty
              if (!(promptValue || "").trim()) {
                onClickSummaryButton(noteId, "Summarize the main content of this page in 8-10 concise bullet points, covering all key details.", e, false);
              }
            }}
            disabled={(promptValue || "").trim().length > 0}
          >
            Summary
          </button>
          <button
            type="button"
            className="note-ai-chip"
            onClick={(e) => {
              e.stopPropagation();
              // Only allow button if input is empty
              if (!(promptValue || "").trim()) {
                onClickSummaryButton(noteId, "Provide a detailed explanation of what this page or product is about. Include: its purpose, who it's for, what problem it solves, key features or benefits, and why it matters. Be thorough and comprehensive.", e, false);
              }
            }}
            disabled={(promptValue || "").trim().length > 0}
          >
            About this
          </button>
        </div>
      )}

      {hasOutput && (
        <button
          type="button"
          className="note-ai-toggle"
          onClick={handleToggleCollapse}
          aria-label="Toggle AI output"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 6l6 6-6 6-1.4-1.4L14.2 12 10.6 7.4z" fill="currentColor" />
          </svg>
        </button>
      )}

      {hasOutput && !effectiveCollapsed && (
        <button
          type="button"
          className="note-ai-apply-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (!summaryText.trim() || isSummarizing) return;
            onApply(noteId, summaryText);
          }}
          disabled={isSummarizing || !summaryText.trim()}
          aria-label="Apply AI output to note"
        >
          Apply
        </button>
      )}

      <div className="note-ai-output">
        <AnimatedSummaryContent
          isSummarizing={isSummarizing}
          text={summaryText}
          placeholder="AI responses will appear here."
          heightCap={effectiveCollapsed ? 0 : 260}
          minHeight={effectiveCollapsed ? 0 : 48}
        />
      </div>

      <div className="note-ai-divider" />

      <form
        className="note-ai-prompt-row"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Auto-expand the AI box when submitting a prompt
          if (effectiveCollapsed) {
            aiSummary.toggleCollapse(noteId);
          }
          onSubmit(noteId, promptValue, e);
          aiSummary.clearPrompt(noteId);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="note-ai-input"
          value={promptValue ?? ""}
          onChange={(e) => handlePromptChange(e.target.value)}
          placeholder='Type a prompt (e.g. "summarize", "turn into tasks")'
          disabled={isSummarizing}
        />
        <button type="submit" className="note-ai-send-btn" disabled={isSummarizing}>
          {isSummarizing ? "Thinking..." : "Send"}
        </button>
      </form>
    </section>
  );
}

export default AISummary;
