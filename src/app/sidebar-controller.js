const SIDEBAR_COLLAPSED_STORAGE_KEY = "qa-sidebar-collapsed";

export function createSidebarController({ updateFilters, render }) {
  function initSidebarState() {
    const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  }

  function isTestModeRoute() {
    const path = String(window.location.pathname || "").replace(/\/+$/, "");
    return /\/test(?:\/index\.html)?$/.test(path);
  }

  function toggleSidebarCollapsed() {
    const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
    render();
  }

  function handleSidebarNavigationClick(event) {
    const toggleButton = event.target.closest("#sidebar-toggle");
    if (toggleButton) {
      toggleSidebarCollapsed();
      return;
    }

    const navButton = event.target.closest("[data-nav-surface]");
    if (!navButton) {
      return;
    }

    updateFilters({
      surface: navButton.dataset.navSurface || "all",
      page: navButton.dataset.navPage || "all",
    });
  }

  return {
    initSidebarState,
    isTestModeRoute,
    handleSidebarNavigationClick,
  };
}
