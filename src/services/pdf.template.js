import {
  escapeAttribute,
  escapeHtml,
  formatPercent,
  formatReportDate,
} from "../utils/format.js";

export function buildPrintablePdfDocument(report, options = {}) {
  const baseHref = options.baseHref || window.location.href;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(report.brand.reportName)}</title>
      <base href="${escapeAttribute(baseHref)}" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>${buildPrintableStyles()}</style>
    </head>
    <body>
      <main class="report-shell">
        ${renderCoverPage(report)}
        ${renderTocPage(report)}
        ${renderSummaryPage(report)}
        ${renderDetailPages(report)}
      </main>
    </body>
    </html>
  `;
}

function renderCoverPage(report) {
  const coverage = formatPercent(report.reportStats.testedCount, report.reportStats.totalCards);
  const summaryItems = toSentenceList(report.summaryText, 5);
  const scopeItems = [
    report.detailScope.summary,
    report.detailScope.inclusionNote,
  ];
  const vigilanceItems = report.topProblems.length
    ? report.topProblems.slice(0, 3).map((card) => `${card.title} · ${card.reportStatus.label}`)
    : [
      `${report.metrics.blockersCount} point(s) bloquant(s) encore ouvert(s).`,
      `${report.metrics.notesCount} carte(s) avec notes terrain et ${report.metrics.screenshotsCount} capture(s) déjà jointes.`,
    ];

  return `
    <section class="report-page report-cover">
      <div class="page-frame">
        <section class="hero-card">
          <div class="hero-copy">
            <span class="eyebrow-chip eyebrow-chip--primary">QA Dashboard</span>
            <p class="hero-company">${escapeHtml(report.brand.companyName)}</p>
            <h1>${escapeHtml(report.brand.reportName)}</h1>
            <p class="hero-project">${escapeHtml(report.brand.projectName)}</p>
            <div class="meta-grid">
              ${renderMetaItem("Testeur", report.meta.tester || "Non renseigné")}
              ${renderMetaItem("Environnement", report.meta.environment || "Non renseigné")}
              ${renderMetaItem("Généré le", formatReportDate(report.generatedAt))}
            </div>
          </div>

          <aside class="hero-score-card">
            <div class="brand-mark">
              <img
                src="${escapeAttribute(report.brand.logoPath)}"
                alt="Logo ${escapeAttribute(report.brand.companyName)}"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';"
              />
              <span class="brand-mark__fallback">${escapeHtml(report.brand.logoFallback || "QA")}</span>
            </div>

            <div class="score-card">
              <span class="eyebrow-chip eyebrow-chip--subtle">Score QA</span>
              <strong class="score-card__value">${escapeHtml(String(report.reportStats.scorePercent))}%</strong>
              <p class="score-card__copy">Couverture ${escapeHtml(coverage)} • ${escapeHtml(String(report.reportStats.testedCount))}/${escapeHtml(String(report.reportStats.totalCards))} cartes testées</p>
              ${renderProgressBar(report.reportStats.scorePercent, "progress-primary")}
              <div class="mini-stats">
                ${renderMiniStat("Notes", report.metrics.notesCount)}
                ${renderMiniStat("Captures", report.metrics.screenshotsCount)}
              </div>
            </div>
          </aside>
        </section>

        <section class="dashboard-grid">
          ${renderMetricTile("Total cartes", report.reportStats.totalCards, "primary")}
          ${renderMetricTile("Validées", report.reportStats.validatedCount, "success")}
          ${renderMetricTile("Échouées", report.reportStats.failedCount, "danger")}
          ${renderMetricTile("En cours", report.reportStats.partialCount, "warning")}
        </section>

        <section class="summary-grid">
          ${renderInsightCard("Résumé global", summaryItems, "primary")}
          <div class="summary-grid__side">
            ${renderInsightCard("Périmètre du détail", scopeItems, "primary compact")}
            ${renderInsightCard(report.topProblems.length ? "Points de vigilance" : "Activité QA", vigilanceItems, report.topProblems.length ? "danger compact" : "warning compact")}
          </div>
        </section>

        ${renderPageFooter(report, "Dashboard QA")}
      </div>
    </section>
  `;
}

function renderTocPage(report) {
  const intro = `${report.detailScope.tocIntro} Chaque entrée renvoie vers la fiche correspondante dans le document.`;

  return `
    <section class="report-page">
      <div class="page-frame">
        <section class="section-hero">
          <span class="eyebrow-chip eyebrow-chip--primary">Sommaire</span>
          <h2>Table des matières des cartes testées</h2>
          <p class="page-intro">${escapeHtml(intro)}</p>
          <div class="meta-strip">
            ${renderMetaStripItem("Cartes détaillées", `${report.detailScope.detailedCount} / ${report.detailScope.totalCount}`)}
            ${renderMetaStripItem("Échecs", report.reportStats.failedCount)}
            ${renderMetaStripItem("En cours", report.reportStats.partialCount)}
          </div>
        </section>

        <section class="toc-list">
          ${
            report.tocCards.length
              ? report.tocCards
                .map(
                  (card, index) => `
                    <a class="toc-row" href="#card-${escapeAttribute(card.id)}">
                      <span class="toc-index">${String(index + 1).padStart(2, "0")}</span>
                      <span class="toc-copy">
                        <strong>${escapeHtml(card.title)}</strong>
                        <small>${escapeHtml(card.surfaceName)} · ${escapeHtml(card.pageName)}</small>
                      </span>
                      <span class="toc-tags">
                        ${renderPill(card.severity.tone, card.severity.badgeLabel || card.severity.label)}
                        ${renderPill(card.reportStatus.key, card.reportStatus.badgeLabel || card.reportStatus.label)}
                      </span>
                    </a>
                  `,
                )
                .join("")
              : renderEmptyPanel(
                "Aucune entrée détaillée pour le moment",
                "Le sommaire se remplira dès qu'une carte comportera au moins une étape jouée, des notes, des captures ou un statut QA hors « À lancer ».",
              )
          }
        </section>

        ${renderPageFooter(report, "Sommaire")}
      </div>
    </section>
  `;
}

function renderSummaryPage(report) {
  return `
    <section class="report-page">
      <div class="page-frame">
        <section class="section-hero">
          <span class="eyebrow-chip eyebrow-chip--primary">Synthèse</span>
          <h2>Vue d'ensemble de la campagne</h2>
          <p class="page-intro">${escapeHtml(report.detailScope.summary)}</p>
        </section>

        <section class="surface-grid">
          ${report.surfaces.map((surface) => renderSurfaceCard(surface)).join("")}
        </section>

        ${
          report.topProblems.length
            ? `
              <section class="detail-section detail-section--plain">
                <div class="section-title-row">
                  <span class="eyebrow-chip eyebrow-chip--danger">Priorités QA</span>
                </div>
                <ul class="bullet-list bullet-list--danger">
                  ${report.topProblems.map((card) => `<li>${escapeHtml(card.title)} · ${escapeHtml(card.surfaceName)} / ${escapeHtml(card.pageName)} · ${escapeHtml(card.reportStatus.label)}</li>`).join("")}
                </ul>
              </section>
            `
            : ""
        }

        ${renderUndetailedCardsSection(report)}

        ${renderPageFooter(report, "Synthèse")}
      </div>
    </section>
  `;
}

function renderSurfaceCard(surface) {
  const coverage = formatPercent(
    surface.metrics.doneCount + surface.metrics.progressCount,
    surface.metrics.totalCards,
  );

  return `
    <article class="surface-card">
      <div class="surface-card__head">
        <div>
          <h3>${escapeHtml(surface.name)}</h3>
          <p>${escapeHtml(surface.description || "Surface sans description complémentaire.")}</p>
        </div>
        <strong>${escapeHtml(String(surface.metrics.qaScore))}%</strong>
      </div>

      ${renderProgressBar(surface.metrics.qaScore, "progress-primary")}

      <div class="surface-card__stats">
        <span>${escapeHtml(String(surface.metrics.totalCards))} cartes</span>
        <span>${escapeHtml(String(surface.metrics.doneCount))} validées</span>
        <span>${escapeHtml(String(surface.metrics.progressCount))} en cours</span>
        <span>${escapeHtml(String(surface.metrics.blockersCount))} bloquantes</span>
      </div>

      <small>Couverture actuelle : ${escapeHtml(coverage)}</small>
    </article>
  `;
}

function renderDetailPages(report) {
  if (!report.detailCards.length) {
    return `
      <section class="report-page">
        <div class="page-frame">
          <section class="section-hero">
            <span class="eyebrow-chip eyebrow-chip--primary">Détail</span>
            <h2>Rapport détaillé des cartes testées</h2>
            <p class="page-intro">${escapeHtml(report.detailScope.detailIntro)}</p>
          </section>

          ${renderEmptyPanel(
            "Aucune carte détaillée",
            `${report.detailScope.summary} ${report.detailScope.inclusionNote}`,
          )}

          ${renderPageFooter(report, "Détail")}
        </div>
      </section>
    `;
  }

  return `
    <section class="report-page report-page--detail-intro">
      <div class="page-frame">
        <section class="section-hero">
          <span class="eyebrow-chip eyebrow-chip--primary">Détail des cartes</span>
          <h2>Rapport détaillé des vérifications QA</h2>
          <p class="page-intro">${escapeHtml(report.detailScope.detailIntro)}</p>
          <div class="meta-strip">
            ${renderMetaStripItem("Détaillées", report.detailScope.detailedCount)}
            ${renderMetaStripItem("Échecs", report.reportStats.failedCount)}
            ${renderMetaStripItem("En cours", report.reportStats.partialCount)}
            ${renderMetaStripItem("Captures", report.metrics.screenshotsCount)}
          </div>
        </section>

        ${renderPageFooter(report, "Détail")}
      </div>
    </section>

    <section class="report-flow">
      ${report.detailCards.map((card) => renderDetailCard(card)).join("")}
    </section>
  `;
}

function renderDetailCard(card) {
  const workingItems = card.workingItems.length
    ? card.workingItems
    : [
      card.reportStatus.key === "validated"
        ? "Scénario validé sans anomalie bloquante observée."
        : "Aucun élément positif explicite n'a encore été documenté.",
    ];
  const problemItems = card.problemItems.length
    ? card.problemItems
    : [
      card.reportStatus.key === "failed"
        ? "Les anomalies remontées restent à consolider dans les prochaines relectures."
        : "Aucun problème bloquant n'a été remonté dans cette fiche.",
    ];

  return `
    <article class="detail-card" id="card-${escapeAttribute(card.id)}">
      <header class="detail-card__header tone-${escapeAttribute(card.reportStatus.key)}">
        <div class="detail-card__intro">
          <p class="detail-path">${escapeHtml(card.surfaceName)} · ${escapeHtml(card.pageName)}</p>
          <h3>${escapeHtml(card.title)}</h3>
          <p class="detail-scenario">${escapeHtml(card.scenarioTitle)}</p>
        </div>

        <div class="detail-badges">
          ${renderPill(card.reportStatus.key, card.reportStatus.badgeLabel || card.reportStatus.label)}
          ${renderPill(`severity-${card.severity.tone}`, card.severity.badgeLabel || card.severity.label)}
        </div>
      </header>

      <div class="detail-meta-grid">
        ${renderMetaStripItem("Statut QA", card.status.label)}
        ${renderMetaStripItem("Progression", `${card.checklist.checked}/${card.checklist.total} • ${card.checklist.progressPercent}%`)}
        ${renderMetaStripItem("Testeur", card.tester || "Non renseigné")}
        ${renderMetaStripItem("Environnement", card.environment || "Non renseigné")}
      </div>

      <section class="detail-section">
        <div class="section-title-row">
          <span class="eyebrow-chip eyebrow-chip--subtle">Description</span>
        </div>
        <p>${escapeHtml(card.testDescription)}</p>
      </section>

      ${
        card.expectedResult
          ? `
            <section class="detail-section detail-section--success">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--success">Résultat attendu</span>
              </div>
              <p>${escapeHtml(card.expectedResult)}</p>
            </section>
          `
          : ""
      }

      ${
        card.scenarioSteps.length
          ? `
            <section class="detail-section">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--primary">Scénario utilisateur</span>
              </div>
              <ol class="timeline">
                ${card.scenarioSteps.map((step, index) => renderStep(step, index)).join("")}
              </ol>
            </section>
          `
          : ""
      }

      <section class="detail-section">
        <div class="section-title-row">
          <span class="eyebrow-chip eyebrow-chip--subtle">Résultats</span>
        </div>
        <div class="result-grid">
          ${renderResultPanel("✔ Ce qui fonctionne", workingItems, "success")}
          ${renderResultPanel("✖ Problèmes détectés", problemItems, "danger")}
        </div>
      </section>

      ${
        card.recommendations.length
          ? `
            <section class="detail-section detail-section--info">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--primary">Recommandations</span>
              </div>
              <ul class="bullet-list bullet-list--info">
                ${card.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
          `
          : ""
      }

      ${
        card.notes
          ? `
            <section class="detail-section detail-section--warning">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--warning">Notes</span>
              </div>
              <blockquote class="note-block">${escapeHtml(card.notes)}</blockquote>
            </section>
          `
          : ""
      }

      ${
        card.screenshots.length
          ? `
            <section class="detail-section">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--subtle">Images</span>
              </div>
              <div class="image-grid">
                ${card.screenshots.map((shot) => `
                  <figure class="image-card">
                    <img src="${escapeAttribute(shot.dataUrl)}" alt="${escapeAttribute(shot.name)}" />
                    <figcaption>${escapeHtml(shot.name)}</figcaption>
                  </figure>
                `).join("")}
              </div>
            </section>
          `
          : ""
      }

      ${
        card.references.length
          ? `
            <section class="detail-section detail-section--plain">
              <div class="section-title-row">
                <span class="eyebrow-chip eyebrow-chip--subtle">Références utiles</span>
              </div>
              <ul class="bullet-list bullet-list--info">
                ${card.references.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
          `
          : ""
      }
    </article>
  `;
}

function renderStep(step, index) {
  const statusKey = step.status === "ok" ? "validated" : step.status === "ko" ? "failed" : "untested";

  return `
    <li class="timeline-item timeline-item--${escapeAttribute(step.status)}">
      <span class="timeline-index">${index + 1}</span>
      <div class="timeline-card">
        <div class="timeline-card__head">
          <strong>${escapeHtml(step.label)}</strong>
          ${renderPill(statusKey, step.statusBadgeLabel || step.statusLabel)}
        </div>
        <p class="step-stamp">${escapeHtml(step.testStamp || "Étape non testée pour le moment.")}</p>
        ${
          step.status === "ko" && step.bug
            ? `
              <div class="bug-box">
                <p><strong>Bug :</strong> ${escapeHtml(step.bug.description)}</p>
                <p><strong>Observé :</strong> ${escapeHtml(step.bug.observedBehavior)}</p>
                <p><strong>Attendu :</strong> ${escapeHtml(step.bug.expectedResult)}</p>
              </div>
            `
            : ""
        }
      </div>
    </li>
  `;
}

function renderResultPanel(title, items, tone) {
  return `
    <article class="result-panel result-panel--${escapeAttribute(tone)}">
      <h4>${escapeHtml(title)}</h4>
      <ul class="bullet-list bullet-list--${escapeAttribute(tone)}">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderUndetailedCardsSection(report) {
  if (!report.undetailedCards.length) {
    return "";
  }

  return `
    <section class="detail-section detail-section--plain">
      <div class="section-title-row">
        <span class="eyebrow-chip eyebrow-chip--subtle">Cartes non détaillées</span>
      </div>
      <p class="page-intro">Ces cartes restent visibles dans le périmètre global, mais n'entrent pas encore dans le détail faute d'activité QA documentée.</p>
      <div class="undetailed-list">
        ${report.undetailedCards.map((card) => `
          <article class="undetailed-card">
            <strong>${escapeHtml(card.title)}</strong>
            <small>${escapeHtml(card.surfaceName)} · ${escapeHtml(card.pageName)}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderInsightCard(title, items, toneClass) {
  const [tone, maybeCompact] = String(toneClass || "primary").split(" ");
  const compactClass = maybeCompact === "compact" ? " insight-card--compact" : "";
  const listTone = tone === "danger" ? "danger" : tone === "warning" ? "warning" : "info";

  return `
    <section class="insight-card insight-card--${escapeAttribute(tone)}${compactClass}">
      <div class="section-title-row">
        <span class="eyebrow-chip eyebrow-chip--${escapeAttribute(tone)}">${escapeHtml(title)}</span>
      </div>
      <ul class="bullet-list bullet-list--${escapeAttribute(listTone)}">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderMetricTile(label, value, tone) {
  return `
    <article class="metric-tile metric-tile--${escapeAttribute(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function renderMetaItem(label, value) {
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderMetaStripItem(label, value) {
  return `
    <div class="meta-strip__item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderMiniStat(label, value) {
  return `
    <div class="mini-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderPageFooter(report, sectionLabel) {
  return `
    <footer class="page-footer">
      <span>${escapeHtml(report.brand.reportName)} · ${escapeHtml(report.brand.projectName)}</span>
      <span>${escapeHtml(sectionLabel)} · ${escapeHtml(formatReportDate(report.generatedAt))}</span>
    </footer>
  `;
}

function renderPill(theme, label) {
  return `<span class="pill pill--${escapeAttribute(theme)}">${escapeHtml(label)}</span>`;
}

function renderProgressBar(value, className) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return `
    <div class="progress ${escapeAttribute(className)}">
      <span style="width:${clamped}%"></span>
    </div>
  `;
}

function renderEmptyPanel(title, copy) {
  return `
    <section class="empty-panel">
      <span class="eyebrow-chip eyebrow-chip--warning">État actuel</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </section>
  `;
}

function toSentenceList(text, maxItems = 5) {
  return (String(text || "").match(/[^.!?]+[.!?]?/g) || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildPrintableStyles() {
  return `
    @font-face {
      font-family: "Quantify";
      src: url("./assets/fonts/quantify/Quantify.ttf") format("truetype");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }

    @font-face {
      font-family: "Poppins";
      src: url("./assets/fonts/poppins/Poppins-Regular.ttf") format("truetype");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }

    @font-face {
      font-family: "Poppins";
      src: url("./assets/fonts/poppins/Poppins-Medium.ttf") format("truetype");
      font-style: normal;
      font-weight: 500;
      font-display: swap;
    }

    @font-face {
      font-family: "Poppins";
      src: url("./assets/fonts/poppins/Poppins-SemiBold.ttf") format("truetype");
      font-style: normal;
      font-weight: 600;
      font-display: swap;
    }

    @font-face {
      font-family: "Poppins";
      src: url("./assets/fonts/poppins/Poppins-Bold.ttf") format("truetype");
      font-style: normal;
      font-weight: 700;
      font-display: swap;
    }

    @font-face {
      font-family: "Poppins";
      src: url("./assets/fonts/poppins/Poppins-Black.ttf") format("truetype");
      font-style: normal;
      font-weight: 900;
      font-display: swap;
    }

    :root {
      --font-display: "Quantify", "Poppins", "Segoe UI", sans-serif;
      --font-body: "Poppins", "Segoe UI", sans-serif;
      --bg: #f3f7fc;
      --surface: #ffffff;
      --surface-muted: #f8fbff;
      --border: #dbe4f0;
      --border-soft: #e8eef6;
      --text: #172033;
      --text-muted: #5d6b85;
      --text-soft: #70819c;
      --primary: #2563eb;
      --primary-soft: #e6eeff;
      --success: #16a34a;
      --success-soft: #ecfdf3;
      --danger: #dc2626;
      --danger-soft: #fef2f2;
      --warning: #d97706;
      --warning-soft: #fff7ed;
      --shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
    }

    @page {
      size: A4;
      margin: 14mm 12mm;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      color: var(--text);
      background: var(--bg);
      font-family: var(--font-body);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      padding: 18px 0;
    }

    .report-shell {
      width: min(100%, 980px);
      margin: 0 auto;
      display: grid;
      gap: 22px;
    }

    .report-page,
    .report-flow {
      border: 1px solid var(--border);
      border-radius: 30px;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 26%),
        linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      box-shadow: var(--shadow);
      padding: 28px;
    }

    .report-page {
      break-after: page;
    }

    .report-flow {
      break-after: auto;
    }

    .page-frame {
      min-height: 248mm;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    h1,
    h2,
    h3,
    h4,
    p,
    ul,
    ol,
    figure,
    blockquote {
      margin: 0;
    }

    h1 {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 34px;
      line-height: 1.04;
    }

    h2 {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 28px;
      line-height: 1.08;
    }

    h3 {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 20px;
      line-height: 1.15;
    }

    h4 {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 14px;
      line-height: 1.3;
    }

    p,
    li,
    small {
      font-family: var(--font-body);
      font-weight: 400;
      line-height: 1.55;
    }

    .hero-card,
    .section-hero,
    .detail-card,
    .detail-section,
    .surface-card,
    .metric-tile,
    .toc-row,
    .insight-card,
    .empty-panel {
      border: 1px solid var(--border);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.96);
    }

    .hero-card,
    .section-hero,
    .detail-card,
    .detail-section,
    .surface-card,
    .metric-tile,
    .insight-card,
    .empty-panel {
      padding: 20px;
    }

    .hero-card {
      display: grid;
      grid-template-columns: 1.35fr 0.9fr;
      gap: 18px;
      align-items: stretch;
    }

    .hero-copy,
    .hero-score-card,
    .score-card,
    .summary-grid__side,
    .section-hero,
    .detail-card,
    .detail-section,
    .surface-card,
    .insight-card,
    .empty-panel {
      display: grid;
      gap: 14px;
    }

    .eyebrow-chip {
      font-family: var(--font-body);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      min-height: 28px;
      padding: 0 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border: 1px solid transparent;
    }

    .eyebrow-chip--primary,
    .pill--validated,
    .pill--partial,
    .pill--untested,
    .pill--failed,
    .pill--severity-blocker,
    .pill--severity-major,
    .pill--severity-minor {
      background: var(--primary-soft);
      color: var(--primary);
      border-color: rgba(37, 99, 235, 0.16);
    }

    .eyebrow-chip--subtle {
      background: var(--surface-muted);
      color: var(--text-muted);
      border-color: var(--border-soft);
    }

    .eyebrow-chip--success {
      background: var(--success-soft);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.18);
    }

    .eyebrow-chip--danger {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.16);
    }

    .eyebrow-chip--warning {
      background: var(--warning-soft);
      color: var(--warning);
      border-color: rgba(217, 119, 6, 0.16);
    }

    .hero-company,
    .hero-project,
    .page-intro,
    .detail-scenario,
    .detail-path,
    .step-stamp,
    .meta-item span,
    .meta-strip__item span,
    .metric-tile span,
    .surface-card p,
    .surface-card small,
    .page-footer,
    .toc-copy small,
    .mini-stat span {
      color: var(--text-muted);
    }

    .hero-company {
      font-size: 14px;
      font-weight: 700;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .meta-item,
    .meta-strip__item,
    .mini-stat {
      display: grid;
      gap: 4px;
      border: 1px solid var(--border-soft);
      border-radius: 16px;
      background: var(--surface-muted);
      padding: 12px 14px;
    }

    .meta-item strong,
    .meta-strip__item strong,
    .mini-stat strong {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 13px;
      color: var(--text);
    }

    .hero-score-card {
      align-content: start;
    }

    .brand-mark {
      width: 88px;
      height: 88px;
      border-radius: 22px;
      border: 1px solid var(--border);
      background: var(--surface-muted);
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .brand-mark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .brand-mark__fallback {
      display: none;
      width: 100%;
      height: 100%;
      place-items: center;
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 26px;
      color: var(--primary);
    }

    .score-card {
      border: 1px solid var(--border);
      border-radius: 22px;
      background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
      padding: 18px;
    }

    .score-card__value {
      font-family: var(--font-body);
      font-weight: 900;
      font-size: 48px;
      line-height: 1;
    }

    .score-card__copy {
      font-size: 13px;
    }

    .progress {
      width: 100%;
      height: 10px;
      border-radius: 999px;
      background: var(--primary-soft);
      overflow: hidden;
    }

    .progress span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--primary);
    }

    .mini-stats,
    .dashboard-grid,
    .surface-grid,
    .summary-grid,
    .result-grid,
    .image-grid,
    .undetailed-list,
    .detail-meta-grid,
    .meta-strip {
      display: grid;
      gap: 12px;
    }

    .mini-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .metric-tile {
      gap: 10px;
    }

    .metric-tile strong {
      font-family: var(--font-body);
      font-weight: 900;
      font-size: 28px;
      line-height: 1;
    }

    .metric-tile--primary {
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
    }

    .metric-tile--success {
      background: linear-gradient(180deg, #ffffff 0%, #f5fff8 100%);
    }

    .metric-tile--danger {
      background: linear-gradient(180deg, #ffffff 0%, #fff7f7 100%);
    }

    .metric-tile--warning {
      background: linear-gradient(180deg, #ffffff 0%, #fffaf2 100%);
    }

    .summary-grid {
      grid-template-columns: 1.2fr 0.8fr;
    }

    .surface-grid,
    .undetailed-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .insight-card--compact {
      min-height: 0;
    }

    .meta-strip {
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    }

    .section-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .toc-list {
      display: grid;
      gap: 10px;
    }

    .toc-row {
      display: grid;
      grid-template-columns: 42px 1fr auto;
      gap: 14px;
      align-items: center;
      text-decoration: none;
      color: inherit;
      padding: 16px 18px;
    }

    .toc-index {
      font-family: var(--font-body);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 800;
      color: var(--primary);
      background: var(--primary-soft);
    }

    .toc-copy {
      display: grid;
      gap: 4px;
    }

    .toc-tags,
    .detail-badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .pill {
      font-family: var(--font-body);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 0 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .pill--validated {
      background: var(--success-soft);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.18);
    }

    .pill--failed,
    .pill--severity-blocker {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.18);
    }

    .pill--partial,
    .pill--severity-major {
      background: var(--warning-soft);
      color: var(--warning);
      border-color: rgba(217, 119, 6, 0.18);
    }

    .pill--untested,
    .pill--severity-minor {
      background: var(--surface-muted);
      color: var(--text-soft);
      border-color: var(--border-soft);
    }

    .surface-card__head,
    .detail-card__header,
    .timeline-card__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .surface-card__head strong {
      font-family: var(--font-body);
      font-weight: 900;
      font-size: 28px;
      line-height: 1;
    }

    .surface-card__stats,
    .detail-meta-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .detail-card {
      break-inside: avoid-page;
      page-break-inside: avoid;
      margin-bottom: 18px;
      padding: 22px;
    }

    .detail-card__header {
      padding: 18px;
      border-radius: 20px;
      border: 1px solid var(--border-soft);
    }

    .tone-validated {
      background: linear-gradient(180deg, #ffffff 0%, #f5fff8 100%);
    }

    .tone-failed {
      background: linear-gradient(180deg, #ffffff 0%, #fff7f7 100%);
    }

    .tone-partial {
      background: linear-gradient(180deg, #ffffff 0%, #fffaf2 100%);
    }

    .tone-untested {
      background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
    }

    .detail-path {
      font-family: var(--font-body);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .detail-section--success {
      background: linear-gradient(180deg, #ffffff 0%, #f5fff8 100%);
    }

    .detail-section--warning {
      background: linear-gradient(180deg, #ffffff 0%, #fffaf2 100%);
    }

    .detail-section--info {
      background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
    }

    .detail-section--plain {
      background: #ffffff;
    }

    .timeline {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 12px;
    }

    .timeline-item {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 12px;
      align-items: start;
    }

    .timeline-index {
      font-family: var(--font-body);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--primary-soft);
      color: var(--primary);
      font-weight: 800;
      font-size: 12px;
    }

    .timeline-card {
      display: grid;
      gap: 10px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid var(--border-soft);
      background: var(--surface-muted);
    }

    .timeline-item--ok .timeline-card {
      background: #f7fff9;
      border-color: rgba(22, 163, 74, 0.18);
    }

    .timeline-item--ko .timeline-card {
      background: #fff8f8;
      border-color: rgba(220, 38, 38, 0.18);
    }

    .bug-box {
      display: grid;
      gap: 6px;
      padding: 12px;
      border-radius: 16px;
      background: var(--danger-soft);
      border: 1px solid rgba(220, 38, 38, 0.16);
    }

    .result-grid,
    .image-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .result-panel {
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--border-soft);
      background: var(--surface-muted);
    }

    .result-panel--success {
      background: #f7fff9;
      border-color: rgba(22, 163, 74, 0.18);
    }

    .result-panel--danger {
      background: #fff8f8;
      border-color: rgba(220, 38, 38, 0.18);
    }

    .bullet-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
    }

    .bullet-list--success li::marker {
      color: var(--success);
    }

    .bullet-list--danger li::marker {
      color: var(--danger);
    }

    .bullet-list--info li::marker,
    .bullet-list--warning li::marker {
      color: var(--primary);
    }

    .note-block {
      font-family: var(--font-body);
      margin: 0;
      padding: 16px 18px;
      border-left: 4px solid rgba(217, 119, 6, 0.32);
      border-radius: 16px;
      background: rgba(255, 247, 237, 0.7);
      color: var(--text);
    }

    .image-card {
      margin: 0;
      border: 1px solid var(--border-soft);
      border-radius: 18px;
      overflow: hidden;
      background: #ffffff;
    }

    .image-card img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: var(--surface-muted);
    }

    .image-card figcaption {
      font-family: var(--font-body);
      padding: 10px 12px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .empty-panel h3 {
      font-size: 22px;
    }

    .detail-card__intro h3,
    .section-hero h2,
    .empty-panel h3 {
      font-family: var(--font-display);
      font-weight: 400;
    }

    .score-card__copy,
    .page-intro,
    .detail-scenario,
    .step-stamp,
    .page-footer,
    .surface-card p,
    .surface-card small {
      font-family: var(--font-body);
      font-weight: 400;
    }

    .undetailed-card {
      display: grid;
      gap: 4px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px dashed var(--border);
      background: var(--surface-muted);
      break-inside: avoid;
    }

    .page-footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
    }

    @media (max-width: 860px) {
      .hero-card,
      .summary-grid,
      .dashboard-grid,
      .surface-grid,
      .result-grid,
      .image-grid,
      .undetailed-list,
      .detail-meta-grid,
      .meta-grid {
        grid-template-columns: 1fr;
      }

      .toc-row {
        grid-template-columns: 42px 1fr;
      }

      .toc-tags {
        justify-content: flex-start;
      }
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }

      .report-shell {
        width: auto;
        margin: 0;
        gap: 0;
      }

      .report-page,
      .report-flow {
        box-shadow: none;
        border-radius: 0;
      }
    }
  `;
}
