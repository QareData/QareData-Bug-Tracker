import { escapeAttribute, escapeHtml } from "../../utils/format.js";
import {
  getCardChecklistMetrics,
  getCardRisk,
  getCardStatusMeta,
  getSeverityMeta,
} from "../../core/state.js";

export function renderCard(surface, page, card) {
  const status = getCardStatusMeta(card.status);
  const severity = getSeverityMeta(card.severity);
  const checklist = getCardChecklistMetrics(card);
  const riskClass = getCardRisk(card) ? "is-risk" : "";
  const findingsCount = Math.max(card.sourceIssues?.length || 0, checklist.koCount);
  const notesLabel = card.notes.trim() ? "Oui" : "Non";
  const screenshotCount = card.screenshots.length;

  return `
    <article
      class="qa-card ${riskClass}"
      data-card-id="${escapeAttribute(card.id)}"
      role="button"
      tabindex="0"
      aria-label="Ouvrir la fiche ${escapeAttribute(card.title)}"
    >
      <div class="qa-card__summary">
        <p class="qa-card__path">${escapeHtml(surface.name)} · ${escapeHtml(page.name)}</p>

        <div class="qa-card__summary-top">
          <div class="qa-card__title-group">
            <h4 class="qa-card__title">${escapeHtml(card.title)}</h4>
          </div>

          <div class="qa-card__pills">
            <span class="pill pill-status pill-${status.tone}">${escapeHtml(status.label)}</span>
            <span class="pill pill-severity pill-${severity.tone}">${escapeHtml(severity.label)}</span>
          </div>
        </div>

        <div class="qa-card__metrics-line" aria-label="Résumé de la carte">
          <span><strong>✔</strong> ${checklist.okCount}/${checklist.total}</span>
          <span><strong>🐞</strong> ${findingsCount}</span>
          <span><strong>📝</strong> ${notesLabel}</span>
          <span><strong>📷</strong> ${screenshotCount}</span>
        </div>

        <div class="qa-card__progress">
          <div class="qa-card__progress-labels">
            <span>Progression</span>
            <strong>${checklist.progressPercent}%</strong>
          </div>
          <div class="qa-progress">
            <span style="width:${checklist.progressPercent}%;"></span>
          </div>
        </div>

        <div class="qa-card__summary-actions">
          <button
            class="button secondary small"
            type="button"
            data-action="open-card-modal"
          >
            Ouvrir la fiche
          </button>
        </div>
      </div>
    </article>
  `;
}
