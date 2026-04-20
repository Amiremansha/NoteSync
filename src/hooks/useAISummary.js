import { useState, useCallback } from "react";

/**
 * Custom hook to manage AI Summary box state independently
 * Handles: collapsed state, prompt input, visibility, overlay measurements
 * Reduces clutter in Card.jsx and makes AI box fully reusable
 */
export function useAISummary() {
  const [promptById, setPromptById] = useState({});
  const [aiCollapsedById, setAiCollapsedById] = useState({});
  const [summaryVisibilityById, setSummaryVisibilityById] = useState({});
  const [aiOverlayReserveById, setAiOverlayReserveById] = useState({});

  // Get collapsed state for a specific note
  const getIsAiCollapsed = useCallback(
    (noteId) => aiCollapsedById[noteId] ?? true,
    [aiCollapsedById]
  );

  // Get visibility state for a specific note
  const getIsSummaryVisible = useCallback(
    (noteId) => summaryVisibilityById[noteId] ?? true,
    [summaryVisibilityById]
  );

  // Get prompt for a specific note
  const getPrompt = useCallback(
    (noteId) => promptById[noteId] ?? "",
    [promptById]
  );

  // Toggle collapse state
  const toggleCollapse = useCallback((noteId) => {
    setAiCollapsedById((prev) => ({
      ...prev,
      [noteId]: !prev[noteId],
    }));
  }, []);

  // Toggle visibility
  const toggleVisibility = useCallback((noteId) => {
    setSummaryVisibilityById((prev) => ({
      ...prev,
      [noteId]: !(prev[noteId] ?? true),
    }));
  }, []);

  // Set prompt value
  const setPrompt = useCallback((noteId, value) => {
    setPromptById((prev) => ({
      ...prev,
      [noteId]: value,
    }));
  }, []);

  // Clear prompt after submit
  const clearPrompt = useCallback((noteId) => {
    setPromptById((prev) => ({
      ...prev,
      [noteId]: "",
    }));
  }, []);

  // Show AI box and auto-expand
  const showAndExpandAI = useCallback((noteId) => {
    setSummaryVisibilityById((prev) => ({ ...prev, [noteId]: true }));
    setAiCollapsedById((prev) => ({ ...prev, [noteId]: false }));
  }, []);

  // Update overlay reserve (height of the AI box)
  const updateOverlayReserve = useCallback((noteId, height) => {
    setAiOverlayReserveById((prev) => {
      if (prev[noteId] === height) return prev;
      return { ...prev, [noteId]: height };
    });
  }, []);

  // Get overlay reserve for a note
  const getOverlayReserve = useCallback(
    (noteId) => aiOverlayReserveById[noteId],
    [aiOverlayReserveById]
  );

  return {
    // State objects (for advanced usage)
    promptById,
    aiCollapsedById,
    summaryVisibilityById,
    aiOverlayReserveById,
    
    // Setters (for advanced usage)
    setPromptById,
    setAiCollapsedById,
    setSummaryVisibilityById,
    setAiOverlayReserveById,
    
    // Convenient getters
    getIsAiCollapsed,
    getIsSummaryVisible,
    getPrompt,
    getOverlayReserve,
    
    // Convenient setters
    toggleCollapse,
    toggleVisibility,
    setPrompt,
    clearPrompt,
    showAndExpandAI,
    updateOverlayReserve,
  };
}
