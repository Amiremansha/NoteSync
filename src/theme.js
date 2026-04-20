const THEME_KEY = "notesync-theme";

export function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem(THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  if (typeof window === "undefined") {
    return;
  }

  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  window.localStorage.setItem(THEME_KEY, safeTheme);
  window.dispatchEvent(new CustomEvent("notesync-theme-change", { detail: safeTheme }));
}
