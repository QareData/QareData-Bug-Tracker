import { buildContextDescription, buildContextExpected } from "../../core/card-context.js";
import { escapeAttribute, escapeHtml } from "../../utils/format.js";
import {
  getCardChecklistMetrics,
  getCardStatusMeta,
  getSeverityMeta,
  getSourceStatusMeta,
} from "../../core/state.js";

export function renderCardDetailed(surface, page, card, boardMeta = {}) {
  const status = getCardStatusMeta(card.status);
  const severity = getSeverityMeta(card.severity);
  const sourceStatus = getSourceStatusMeta(card.sourceStatus);
  const checklist = getCardChecklistMetrics(card);
  const notesLabel = card.notes.trim() ? "Présentes" : "Aucune";
  const screenshotCount = card.screenshots.length;
  const testerValue = card.tester || boardMeta.tester || "";
  const environmentValue = card.environment || boardMeta.environment || "";
  const contextDescription = buildContextDescription(card);
  const contextExpected = buildContextExpected(card);

  return `
    <article class="qa-card qa-card--modal" data-card-id="${escapeAttribute(card.id)}">
      <header class="card-modal__header">
        <div class="card-modal__titles">
          <p class="card-modal__kicker">${escapeHtml(surface.name)} · ${escapeHtml(page.name)}</p>
          <h2 class="card-modal__title">${escapeHtml(card.title)}</h2>
        </div>

        <div class="card-modal__badges">
          <span class="pill pill-status pill-${status.tone}">${escapeHtml(status.label)}</span>
          <span class="pill pill-severity pill-${severity.tone}">${escapeHtml(severity.label)}</span>
          <span class="pill pill-source pill-${sourceStatus.tone}">${escapeHtml(sourceStatus.label)}</span>
        </div>
      </header>

      <div class="card-modal__summary">
        <span>Étapes testées ${checklist.checked}/${checklist.total}</span>
        <span>${checklist.okCount} validée${checklist.okCount > 1 ? "s" : ""}</span>
        <span>${checklist.koCount} problème${checklist.koCount > 1 ? "s" : ""}</span>
        <span>${notesLabel}</span>
        <span>${screenshotCount} capture${screenshotCount > 1 ? "s" : ""}</span>
      </div>

      <div class="qa-card__progress card-modal__progress">
        <div class="qa-card__progress-labels">
          <span>Progression de la carte</span>
          <strong>${checklist.progressPercent}%</strong>
        </div>
        <div class="qa-progress">
          <span style="width:${checklist.progressPercent}%;"></span>
        </div>
      </div>

      <div class="card-modal__grid">
        <label class="field">
          <span>Statut QA</span>
          <select class="card-select" data-field="status">
            ${renderSelectOption(card.status, "todo", "À lancer")}
            ${renderSelectOption(card.status, "progress", "En cours")}
            ${renderSelectOption(card.status, "done", "Validée")}
          </select>
        </label>

        <label class="field">
          <span>Criticité</span>
          <select class="card-select" data-field="severity">
            ${renderSelectOption(card.severity, "blocker", "Bloquant")}
            ${renderSelectOption(card.severity, "major", "Majeur")}
            ${renderSelectOption(card.severity, "minor", "Mineur")}
          </select>
        </label>

        <label class="field">
          <span>Testeur</span>
          <input
            class="card-text-input"
            type="text"
            data-field="tester"
            value="${escapeAttribute(testerValue)}"
            placeholder="Nom du testeur"
          />
        </label>

        <label class="field">
          <span>Environnement</span>
          <input
            class="card-text-input"
            type="text"
            data-field="environment"
            value="${escapeAttribute(environmentValue)}"
            placeholder="Ex. Staging iPhone 15"
          />
        </label>
      </div>

      <div class="card-modal__panels">
        <section class="qa-panel qa-panel--context">
          <div class="qa-panel__head">
            <h5>Contexte</h5>
            <span>Vue détaillée de la recette</span>
          </div>

          <div class="card-modal__context-grid">
            ${renderContextBlock("Description", contextDescription)}
            ${renderContextBlock("Résultat attendu", contextExpected)}
          </div>
        </section>

        <section class="qa-panel qa-panel--scenario">
          <div class="qa-panel__head">
            <div>
              <h5>Scénario utilisateur</h5>
              <span>${escapeHtml(card.scenarioTitle || card.title)}</span>
            </div>
            <span>${checklist.checked}/${checklist.total} étape(s) documentée(s)</span>
          </div>

          <ul class="qa-scenario-list">
            ${
              card.checklist.length
                ? card.checklist.map((item, index) => renderScenarioStep(item, index, contextExpected)).join("")
                : `<li class="qa-empty-line">Aucune étape utilisateur sur cette carte.</li>`
            }
          </ul>

          <div class="qa-inline-form">
            <input
              class="new-scenario-step-input"
              type="text"
              placeholder="Ajouter une étape utilisateur"
            />
            <button class="button tertiary small" type="button" data-action="add-scenario-step">
              Ajouter une étape
            </button>
          </div>
        </section>
      </div>

      <div class="card-modal__detail-layout">
        <label class="field textarea-field card-modal__notes-panel">
          <span>Notes QA</span>
          <textarea
            class="card-textarea"
            data-field="notes"
            placeholder="Constats, reproduction, impact, risques..."
          >${escapeHtml(card.notes)}</textarea>
        </label>

        <section class="qa-panel qa-panel--upload">
          <div class="qa-panel__head">
            <h5>Captures et preuves</h5>
            <span>${screenshotCount} capture${screenshotCount > 1 ? "s" : ""}</span>
          </div>

          <label class="qa-dropzone" data-dropzone>
            <input
              class="screenshot-input"
              type="file"
              accept="image/*"
              multiple
              hidden
            />
            <strong>Importer des captures</strong>
            <span>Glisser-déposer ici ou cliquer pour choisir une image.</span>
          </label>

          <div class="qa-shot-grid">
            ${
              screenshotCount
                ? card.screenshots.map((shot) => renderScreenshot(shot)).join("")
                : `<div class="qa-empty-shot">Aucune capture pour le moment.</div>`
            }
          </div>
        </section>
      </div>

      ${
        card.references.length
          ? `
            <div class="qa-card__references">
              <strong>Assets / liens utiles</strong>
              <p>${escapeHtml(card.references.join(" · "))}</p>
            </div>
          `
          : ""
      }

      <div class="qa-card__footer-actions">
        <button
          class="button secondary"
          type="button"
          data-action="edit-card-definition"
        >
          Éditer la carte
        </button>
        <button
          class="button ghost danger"
          type="button"
          data-action="delete-card"
        >
          Supprimer la carte
        </button>
      </div>
    </article>
  `;
}

function renderSelectOption(currentValue, value, label) {
  return `
    <option value="${escapeAttribute(value)}" ${currentValue === value ? "selected" : ""}>
      ${escapeHtml(label)}
    </option>
  `;
}

function renderScenarioStep(item, index, defaultExpectedResult) {
  const isOk = item.status === "ok";
  const isKo = item.status === "ko";
  const stateLabel = isOk ? "Validée" : isKo ? "En échec" : "À tester";
  const stateTone = isOk ? "ok" : isKo ? "ko" : "pending";
  const stateClasses = [
    "qa-scenario-step",
    isOk ? "is-ok" : "",
    isKo ? "is-ko is-bug-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <li class="${stateClasses}" data-step-id="${escapeAttribute(item.id)}" data-step-status="${escapeAttribute(item.status)}">
      <div class="qa-scenario-step__main">
        <div class="qa-scenario-step__content">
          <div class="qa-scenario-step__head">
            <span class="qa-scenario-step__eyebrow">Étape ${index + 1}</span>
            <span class="qa-scenario-step__status qa-scenario-step__status--${stateTone}">${escapeHtml(stateLabel)}</span>
          </div>
          <strong>${escapeHtml(item.label)}</strong>
          <p>${escapeHtml(buildScenarioStepMeta(item))}</p>
        </div>

        <div class="qa-scenario-step__actions">
          <button
            class="button small qa-step-action qa-step-action--ok ${isOk ? "is-active" : ""}"
            type="button"
            data-action="mark-step-ok"
          >
            ✔ Marche
          </button>
          <button
            class="button small qa-step-action qa-step-action--ko ${isKo ? "is-active" : ""}"
            type="button"
            data-action="mark-step-ko"
          >
            ❌ Marche pas
          </button>
          ${
            item.origin === "manual"
              ? `
                <button
                  class="icon-button"
                  type="button"
                  title="Supprimer cette étape"
                  data-action="remove-scenario-step"
                >
                  ×
                </button>
              `
              : ""
          }
        </div>
      </div>

      <div class="qa-step__bug-form" data-default-expected-result="${escapeAttribute(defaultExpectedResult)}">
        <div class="qa-step__bug-grid">
          <label class="field">
            <span>Description du bug</span>
            <textarea
              class="card-textarea qa-step__bug-input qa-step__bug-description"
              placeholder="Décris brièvement le bug rencontré"
            >${escapeHtml(item.bug?.description || "")}</textarea>
          </label>
          <label class="field">
            <span>Comportement observé</span>
            <textarea
              class="card-textarea qa-step__bug-input qa-step__bug-observed"
              placeholder="Que s'est-il passé réellement ?"
            >${escapeHtml(item.bug?.observedBehavior || "")}</textarea>
          </label>
        </div>

        <p class="qa-step__bug-hint">Renseigne la description du bug et le comportement observé. Le résultat attendu est repris depuis le contexte affiché au-dessus.</p>

        <div class="qa-step__bug-actions">
          <button class="button secondary small" type="button" data-action="save-step-bug">
            Enregistrer le bug
          </button>
          ${
            !isKo
              ? `
                <button class="button ghost small" type="button" data-action="cancel-step-ko">
                  Annuler
                </button>
              `
              : ""
          }
        </div>
      </div>
    </li>
  `;
}

function buildScenarioStepMeta(item) {
  if (item.status === "ok") {
    return buildTestStamp("Étape validée", item);
  }

  if (item.status === "ko") {
    return buildTestStamp("Étape en échec documentée", item);
  }

  return "Étape non testée pour le moment.";
}

function buildTestStamp(label, item) {
  const segments = [label];
  if (item.tester) {
    segments.push(`par ${item.tester}`);
  }
  if (item.timestamp) {
    segments.push(formatStepTimestamp(item.timestamp));
  }
  return segments.join(" · ");
}

function formatStepTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContextBlock(title, value) {
  return `
    <section class="card-modal__context-block">
      <h6>${escapeHtml(title)}</h6>
      <p>${escapeHtml(value)}</p>
    </section>
  `;
}

function renderScreenshot(shot) {
  return `
    <figure class="qa-shot" data-screenshot-id="${escapeAttribute(shot.id)}">
      <img src="${escapeAttribute(shot.dataUrl)}" alt="${escapeAttribute(shot.name)}" />
      <figcaption>${escapeHtml(shot.name)}</figcaption>
      <button
        class="icon-button qa-shot__remove"
        type="button"
        data-action="remove-screenshot"
        title="Supprimer cette capture"
      >
        ×
      </button>
    </figure>
  `;
}
