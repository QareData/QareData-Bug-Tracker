import { getBoardMetrics } from "../../core/state.js";
import { escapeAttribute, escapeHtml } from "../../utils/format.js";

export function renderSummary(board, root) {
  if (!root) {
    return;
  }

  const metrics = getBoardMetrics(board);

  root.innerHTML = `
    <div class="summary-line" aria-label="Nombre total de cartes">
      <span class="summary-line__label">Cartes totales</span>
      <strong class="summary-line__value">${metrics.totalCards}</strong>
    </div>
  `;
}

export function renderSidebarNavigation(board, filters, root, isCollapsed = false) {
  if (!root) {
    return;
  }

  const metrics = getBoardMetrics(board);
  const activeSurfaceId = resolveActiveSurfaceId(board, filters);
  const activePageId = filters?.page || "all";
  const activeSurface = board.surfaces.find((surface) => surface.id === activeSurfaceId) || null;

  root.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-heading">
        <span class="sidebar-title">Navigation</span>
        <span class="sidebar-caption">${metrics.totalCards} cartes</span>
      </div>
      <button
        class="sidebar-toggle"
        id="sidebar-toggle"
        type="button"
        title="${isCollapsed ? "Déplier la navigation" : "Réduire la navigation"}"
        aria-label="${isCollapsed ? "Déplier la navigation" : "Réduire la navigation"}"
        aria-pressed="${isCollapsed ? "true" : "false"}"
      >
        ${isCollapsed ? "»" : "«"}
      </button>
    </div>

    <div class="sidebar-scroll">
      <div class="sidebar-group">
        <button
          class="sidebar-nav-item ${filters.surface === "all" && activePageId === "all" ? "is-active" : ""}"
          type="button"
          data-nav-surface="all"
          data-nav-page="all"
          title="Vue globale"
        >
          <span class="sidebar-nav-item__icon" aria-hidden="true">⌂</span>
          <span class="sidebar-nav-item__label">Vue globale</span>
          <span class="sidebar-nav-item__count">${metrics.totalCards}</span>
        </button>
      </div>

      <div class="sidebar-group">
        <span class="sidebar-group__title">Surfaces</span>
        <div class="sidebar-nav-list">
          ${board.surfaces.map((surface) => renderSurfaceNavItem(surface, activeSurfaceId)).join("")}
        </div>
      </div>

      ${
        activeSurface
          ? `
            <div class="sidebar-group">
              <span class="sidebar-group__title">Pages</span>
              <div class="sidebar-nav-list">
                <button
                  class="sidebar-nav-item sidebar-nav-item--page ${activePageId === "all" ? "is-active" : ""}"
                  type="button"
                  data-nav-surface="${escapeAttribute(activeSurface.id)}"
                  data-nav-page="all"
                  title="Toutes les pages de ${escapeAttribute(activeSurface.name)}"
                >
                  <span class="sidebar-nav-item__icon" aria-hidden="true">•</span>
                  <span class="sidebar-nav-item__label">Toutes les pages</span>
                  <span class="sidebar-nav-item__count">${getSurfaceCardCount(activeSurface)}</span>
                </button>
                ${activeSurface.pages.map((page) => renderPageNavItem(activeSurface, page, activePageId)).join("")}
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderSurfaceNavItem(surface, activeSurfaceId) {
  return `
    <button
      class="sidebar-nav-item ${surface.id === activeSurfaceId ? "is-active" : ""}"
      type="button"
      data-nav-surface="${escapeAttribute(surface.id)}"
      data-nav-page="all"
      title="${escapeAttribute(surface.name)}"
    >
      <span class="sidebar-nav-item__icon" aria-hidden="true">${escapeHtml(getInitials(surface.name))}</span>
      <span class="sidebar-nav-item__label">${escapeHtml(surface.name)}</span>
      <span class="sidebar-nav-item__count">${getSurfaceCardCount(surface)}</span>
    </button>
  `;
}

function renderPageNavItem(surface, page, activePageId) {
  return `
    <button
      class="sidebar-nav-item sidebar-nav-item--page ${page.id === activePageId ? "is-active" : ""}"
      type="button"
      data-nav-surface="${escapeAttribute(surface.id)}"
      data-nav-page="${escapeAttribute(page.id)}"
      title="${escapeAttribute(page.name)}"
    >
      <span class="sidebar-nav-item__icon" aria-hidden="true">•</span>
      <span class="sidebar-nav-item__label">${escapeHtml(page.name)}</span>
      <span class="sidebar-nav-item__count">${page.cards.length}</span>
    </button>
  `;
}

function resolveActiveSurfaceId(board, filters = {}) {
  if (filters.surface && filters.surface !== "all") {
    return filters.surface;
  }

  if (filters.page && filters.page !== "all") {
    const matchingSurface = board.surfaces.find((surface) =>
      surface.pages.some((page) => page.id === filters.page),
    );

    if (matchingSurface) {
      return matchingSurface.id;
    }
  }

  return "all";
}

function getSurfaceCardCount(surface) {
  return surface.pages.reduce((total, page) => total + page.cards.length, 0);
}

function getInitials(label = "") {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
