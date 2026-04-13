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
    .map((surface) => renderSurface(surface))
    .join("");
}

function renderSurface(surface) {
  const metrics = getSurfaceMetrics(surface);
  const completionPercent = metrics.totalCards
    ? Math.round((metrics.doneCount / metrics.totalCards) * 100)
    : 0;

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
          <span>${metrics.doneCount} validées</span>
          <span>${metrics.progressCount} en cours</span>
          <strong>${metrics.qaScore}/100</strong>
        </div>
      </header>

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
        ${surface.pages.map((page) => renderPage(surface, page)).join("")}
      </div>
    </section>
  `;
}

function renderPage(surface, page) {
  const metrics = getPageMetrics(page);

  return `
    <section class="page-section">
      <header class="page-section__header">
        <div>
          <p class="page-section__kicker">Page / flux</p>
          <h3>${escapeHtml(page.name)}</h3>
        </div>
        <div class="page-section__meta">
          <span>${metrics.totalCards} carte(s)</span>
          <strong>${metrics.completionPercent}% valide</strong>
        </div>
      </header>

      <div class="cards-grid">
        ${page.cards.map((card) => renderCard(surface, page, card)).join("")}
      </div>
    </section>
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
