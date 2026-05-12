import { getFilteredBoard, getSurfaceMetrics } from "../core/state.js";
import { escapeHtml } from "../utils/format.js";
import { renderSidebarNavigation, renderSummary } from "./components/sidebar.js";
import { renderCard } from "./components/card.js";

export function renderApp(state, elements) {
  renderSummary(state.board, elements.summaryRoot);
  renderSidebarNavigation(
    state.board,
    state.filters,
    elements.sidebarNavRoot,
    document.body.classList.contains("sidebar-collapsed"),
  );
  renderBoard(state, elements.boardRoot);
}

function renderBoard(state, root) {
  const filteredSurfaces = getFilteredBoard(state.board, state.filters);

  if (!filteredSurfaces.length) {
    root.innerHTML = `
      <div class="empty-state">
        Aucun résultat ne correspond aux filtres actuels.
      </div>
    `;
    return;
  }

  root.innerHTML = filteredSurfaces
    .map((surface) => renderSurface(surface, state.filters))
    .join("");
}

function renderSurface(surface, filters) {
  const metrics = getSurfaceMetrics(surface);
  const completionPercent = metrics.totalCards
    ? Math.round((metrics.doneCount / metrics.totalCards) * 100)
    : 0;
  const isExpanded = Boolean(filters?.expandedSurfaces?.[surface.id]);

  return `
    <section class="surface-section">
      <header class="surface-section__header">
        <div>
          <p class="surface-section__kicker">Surface</p>
          <h2>${escapeHtml(surface.name)}</h2>
          <p class="surface-section__description">${escapeHtml(surface.description || "Aucune description.")}</p>
        </div>

        <div class="surface-section__stats">
          <span>${metrics.totalCards} cartes</span>
          <button
            class="button tertiary small surface-section__density-toggle"
            type="button"
            data-action="toggle-surface-details"
            data-surface-key="${escapeHtml(surface.id)}"
            aria-pressed="${isExpanded ? "true" : "false"}"
          >
            ${isExpanded ? "Compacter" : "Agrandir"}
          </button>
          <strong>${metrics.qaScore}/100</strong>
        </div>
      </header>

      ${isExpanded ? `
      <div class="surface-section__progress">
        <div class="qa-card__progress-labels">
          <span>Progression globale</span>
          <strong>${completionPercent}%</strong>
        </div>
        <div class="qa-progress">
          <span style="width:${completionPercent}%;"></span>
        </div>
        <p>${completionPercent}% de la surface est déjà validée.</p>
      </div>

      <div class="page-stack">
        ${surface.pages.map((page) => renderPage(surface, page, filters)).join("")}
      </div>
      ` : renderSurfacePagesOverview(surface)}
    </section>
  `;
}

function renderPage(surface, page, filters) {
  const metrics = getPageMetrics(page);
  const pageKey = `${surface.id}::${page.id}`;
  const isExpanded = Boolean(filters?.expandedPages?.[pageKey]);
  const isCompact = !isExpanded;

  return `
    <section class="page-section">
      <header class="page-section__header">
        <div>
          <p class="page-section__kicker">Page / flux</p>
          <h3>${escapeHtml(page.name)}</h3>
        </div>
        <div class="page-section__meta">
          <span>${metrics.totalCards} carte(s)</span>
          <button
            class="button tertiary small page-section__density-toggle"
            type="button"
            data-action="toggle-page-density"
            data-page-key="${escapeHtml(pageKey)}"
            aria-pressed="${isExpanded ? "true" : "false"}"
          >
            ${isExpanded ? "Compacter" : "Agrandir"}
          </button>
          <strong>${metrics.completionPercent}% valide</strong>
        </div>
      </header>

      <div class="cards-grid ${isCompact ? "cards-grid--compact" : ""}">
        ${page.cards.map((card) => renderCard(surface, page, card, { compact: isCompact })).join("")}
      </div>
    </section>
  `;
}

function renderSurfacePagesOverview(surface) {
  return `
    <div class="surface-overview" aria-label="Vue compacte des pages et flux">
      ${surface.pages.map((page) => {
    const metrics = getPageMetrics(page);
    return `
          <article class="surface-overview__row">
            <p class="surface-overview__title">${escapeHtml(page.name)}</p>
            <div class="surface-overview__metrics">
              <span>${metrics.totalCards} carte(s)</span>
              <strong>${metrics.completionPercent}% valide</strong>
            </div>
          </article>
        `;
  }).join("")}
    </div>
  `;
}

function getPageMetrics(page) {
  const totalCards = page.cards.length;
  const doneCount = page.cards.filter((card) => card.status === "done").length;

  return {
    totalCards,
    completionPercent: totalCards
      ? Math.round((doneCount / totalCards) * 100)
      : 0,
  };
}
