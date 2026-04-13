const THEME_TRANSITION_FALLBACK_DURATION_MS = 620;
const THEME_TRANSITION_FALLBACK_STAGGER_MS = 260;

export function createThemeController({ elements }) {
  let themeTransitionInProgress = false;

  function initTheme() {
    const isDark = localStorage.getItem("theme") === "dark";
    applyThemeState(isDark, false);
  }

  function handleThemeToggle() {
    if (themeTransitionInProgress) {
      return;
    }

    const nextIsDark = !document.body.classList.contains("dark-mode");
    if (prefersReducedMotion()) {
      applyThemeState(nextIsDark, true);
      return;
    }

    runThemeTransition(nextIsDark).catch(() => {
      applyThemeState(nextIsDark, true);
      themeTransitionInProgress = false;
    });
  }

  async function runThemeTransition(nextIsDark) {
    themeTransitionInProgress = true;
    const transitionDirection = nextIsDark ? "to-dark" : "to-light";

    if (typeof document.startViewTransition === "function") {
      document.documentElement.dataset.themeTransitionDirection = transitionDirection;

      const transition = document.startViewTransition(() => {
        applyThemeState(nextIsDark, true);
      });

      await transition.finished.finally(() => {
        document.documentElement.removeAttribute("data-theme-transition-direction");
        themeTransitionInProgress = false;
      });
      return;
    }

    const transitionClass = nextIsDark ? "theme-direction-down" : "theme-direction-up";
    const transitionItems = getThemeTransitionItems();
    const transitionDurationMs = getThemeTransitionDurationMs(transitionDirection);
    const transitionStaggerMs = getThemeTransitionStaggerMs();
    applyThemeTransitionDelays(transitionItems, nextIsDark);
    document.body.classList.add("is-theme-transitioning", transitionClass);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        applyThemeState(nextIsDark, true);
      });
    });

    await new Promise((resolve) => {
      const cleanupDelay = transitionDurationMs + transitionStaggerMs + 80;
      window.setTimeout(() => {
        transitionItems.forEach((item) => item.style.removeProperty("--theme-transition-delay"));
        document.body.classList.remove("is-theme-transitioning", "theme-direction-down", "theme-direction-up");
        themeTransitionInProgress = false;
        resolve();
      }, cleanupDelay);
    });
  }

  function getThemeTransitionItems() {
    const selectors = [
      "body",
      ".app-header",
      ".header-meta-card",
      ".kpi-item",
      ".app-main",
      ".sidebar-sections",
      ".content-area",
      ".surface-block",
      ".page-block",
      ".qa-card",
      ".modal-container",
      ".modal-content",
      ".create-card-panel",
      ".btn",
      ".meta-input",
      ".card-select",
      ".card-text-input",
      "input",
      "select",
      "textarea",
      ".save-status",
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")));
  }

  function applyThemeTransitionDelays(items, nextIsDark) {
    const viewportHeight = Math.max(window.innerHeight || 1, 1);
    const transitionStaggerMs = getThemeTransitionStaggerMs();

    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const centerY = rect.top + (rect.height / 2);
      const normalized = Math.min(Math.max(centerY / viewportHeight, 0), 1);
      const progress = nextIsDark ? normalized : 1 - normalized;
      const delay = Math.round(progress * transitionStaggerMs);
      item.style.setProperty("--theme-transition-delay", `${delay}ms`);
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  function getThemeTransitionDurationMs(direction = "to-dark") {
    const propertyName = direction === "to-light"
      ? "--theme-transition-duration-to-light"
      : "--theme-transition-duration-to-dark";
    const rawValue = getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim();
    const matchedDuration = rawValue.match(/^(-?[\\d.]+)(ms|s)$/i);

    if (!matchedDuration) {
      return THEME_TRANSITION_FALLBACK_DURATION_MS;
    }

    const durationValue = Number(matchedDuration[1]);
    if (!Number.isFinite(durationValue)) {
      return THEME_TRANSITION_FALLBACK_DURATION_MS;
    }

    return matchedDuration[2].toLowerCase() === "s"
      ? durationValue * 1000
      : durationValue;
  }

  function getThemeTransitionStaggerMs() {
    const rawValue = getComputedStyle(document.documentElement)
      .getPropertyValue("--theme-transition-stagger")
      .trim();
    const matchedDuration = rawValue.match(/^(-?[\\d.]+)(ms|s)$/i);

    if (!matchedDuration) {
      return THEME_TRANSITION_FALLBACK_STAGGER_MS;
    }

    const durationValue = Number(matchedDuration[1]);
    if (!Number.isFinite(durationValue)) {
      return THEME_TRANSITION_FALLBACK_STAGGER_MS;
    }

    return matchedDuration[2].toLowerCase() === "s"
      ? durationValue * 1000
      : durationValue;
  }

  function applyThemeState(isDark, persist) {
    document.body.classList.toggle("dark-mode", isDark);
    if (persist) {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    }
    syncThemeState(isDark);
  }

  function syncThemeState(isDark) {
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    if (elements.themeIcon) {
      elements.themeIcon.textContent = isDark ? "☀" : "☾";
    }
    if (elements.themeButton) {
      const label = isDark ? "Activer le mode clair" : "Activer le mode sombre";
      elements.themeButton.setAttribute("title", label);
      elements.themeButton.setAttribute("aria-label", label);
      elements.themeButton.setAttribute("aria-pressed", isDark ? "true" : "false");
    }
  }

  return {
    initTheme,
    handleThemeToggle,
  };
}
