import {
  escapeAttribute,
  escapeHtml,
  formatPercent,
  formatReportDate,
} from "../utils/format.js?v=20260407-pdf-phase1-1";

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
  return `
    <section class="report-page report-cover">
      <div class="cover-top">
        <div class="cover-brand">
          <div class="cover-logo">
            <img
              src="${escapeAttribute(report.brand.logoPath)}"
              alt="Logo ${escapeAttribute(report.brand.companyName)}"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';"
            />
            <span class="cover-logo-fallback">${escapeHtml(report.brand.logoFallback || "QA")}</span>
          </div>
          <div>
            <p class="eyebrow">Rapport QA</p>
            <h1>${escapeHtml(report.brand.companyName)}</h1>
            <h2>${escapeHtml(report.brand.reportName)}</h2>
            <p class="lead">${escapeHtml(report.brand.projectName)}</p>
          </div>
        </div>

        <div class="cover-meta">
          ${renderMetaItem("Testeur", report.meta.tester || "Non renseigné")}
          ${renderMetaItem("Environnement", report.meta.environment || "Non renseigné")}
          ${renderMetaItem("Date de génération", formatReportDate(report.generatedAt))}
        </div>
      </div>

      <section class="summary-card">
        <h3>Résumé global</h3>
        <div class="kpi-grid">
          ${renderKpi("Total cartes", report.reportStats.totalCards)}
          ${renderKpi("Cartes détaillées", report.detailScope.detailedCount)}
          ${renderKpi("Validées", report.reportStats.validatedCount)}
          ${renderKpi("Échouées", report.reportStats.failedCount)}
          ${renderKpi("Score QA", `${report.reportStats.scorePercent}%`)}
        </div>
        <p class="summary-text">${escapeHtml(report.summaryText)}</p>
        ${renderScopeNote(report, "Périmètre du détail")}
      </section>
    </section>
  `;
}

function renderTocPage(report) {
  return `
    <section class="report-page">
      <p class="eyebrow">Sommaire</p>
      <h2>Table des matières</h2>
      <p class="page-intro">Chaque carte détaillée ci-dessous pointe vers sa fiche complète dans le document.</p>
      ${renderScopeNote(report, "Règle d'inclusion")}
      <div class="toc-list">
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
                    <span class="toc-status status-${escapeAttribute(card.reportStatus.key)}">${escapeHtml(card.reportStatus.badgeLabel || card.reportStatus.label)}</span>
                  </a>
                `,
              )
              .join("")
            : `<div class="empty-card">Aucune carte testée n'est encore disponible dans le rapport.</div>`
        }
      </div>
    </section>
  `;
}

function renderSummaryPage(report) {
  return `
    <section class="report-page">
      <p class="eyebrow">Synthèse</p>
      <h2>Vue d'ensemble de la campagne</h2>
      ${renderScopeNote(report, "Lecture du PDF")}
      <div class="surface-grid">
        ${report.surfaces.map((surface) => renderSurfaceCard(surface)).join("")}
      </div>

      ${
        report.topProblems.length
          ? `
            <section class="section-block">
              <h3>Priorités QA</h3>
              <ul class="bullet-list">
                ${report.topProblems.map((card) => `<li>${escapeHtml(card.title)} · ${escapeHtml(card.surfaceName)} / ${escapeHtml(card.pageName)} · ${escapeHtml(card.reportStatus.label)}</li>`).join("")}
              </ul>
            </section>
          `
          : ""
      }

      ${renderUndetailedCardsSection(report)}
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
        <h3>${escapeHtml(surface.name)}</h3>
        <strong>${surface.metrics.qaScore}%</strong>
      </div>
      <p>${escapeHtml(surface.description || "Surface sans description complémentaire.")}</p>
      <div class="surface-card__stats">
        <span>${surface.metrics.totalCards} cartes</span>
        <span>${surface.metrics.doneCount} validées</span>
        <span>${surface.metrics.progressCount} en cours</span>
        <span>${surface.metrics.blockersCount} bloquantes</span>
      </div>
      <small>Couverture actuelle: ${coverage}</small>
    </article>
  `;
}

function renderDetailPages(report) {
  if (!report.detailCards.length) {
    return `
      <section class="report-page">
        <p class="eyebrow">Détail</p>
        <h2>Aucune carte testée</h2>
        <div class="empty-card">Aucune étape utilisateur n'a encore été validée ou documentée dans le board.</div>
      </section>
    `;
  }

  return `
    <section class="report-flow">
      <div class="detail-intro">
        <p class="eyebrow">Détail des cartes</p>
        <h2>Rapport détaillé des cartes testées</h2>
        <p class="page-intro">${escapeHtml(report.detailScope.detailIntro)}</p>
        <p class="page-intro">${escapeHtml(report.detailScope.inclusionNote)}</p>
      </div>

      ${report.detailCards.map((card) => renderDetailCard(card)).join("")}
    </section>
  `;
}

function renderDetailCard(card) {
  return `
    <article class="detail-card" id="card-${escapeAttribute(card.id)}">
      <header class="detail-card__head">
        <div>
          <p class="detail-path">${escapeHtml(card.surfaceName)} · ${escapeHtml(card.pageName)}</p>
          <h3>${escapeHtml(card.title)}</h3>
          <p class="detail-scenario">${escapeHtml(card.scenarioTitle)}</p>
        </div>
        <div class="detail-badges">
          <span class="pill status-${escapeAttribute(card.reportStatus.key)}">${escapeHtml(card.reportStatus.badgeLabel || card.reportStatus.label)}</span>
          <span class="pill severity-${escapeAttribute(card.severity.tone)}">${escapeHtml(card.severity.badgeLabel || card.severity.label)}</span>
        </div>
      </header>

      <div class="detail-meta">
        <span><strong>Statut QA:</strong> ${escapeHtml(card.status.label)}</span>
        <span><strong>Testeur:</strong> ${escapeHtml(card.tester || "Non renseigné")}</span>
        <span><strong>Environnement:</strong> ${escapeHtml(card.environment || "Non renseigné")}</span>
        <span><strong>Progression:</strong> ${card.checklist.checked}/${card.checklist.total} (${card.checklist.progressPercent}%)</span>
      </div>

      <section class="section-block">
        <h4>Description du test</h4>
        <p>${escapeHtml(card.testDescription)}</p>
      </section>

      ${
        card.expectedResult
          ? `
            <section class="section-block">
              <h4>Résultat attendu</h4>
              <p>${escapeHtml(card.expectedResult)}</p>
            </section>
          `
          : ""
      }

      ${
        card.scenarioSteps.length
          ? `
            <section class="section-block">
              <h4>Scénario utilisateur</h4>
              <div class="step-list">
                ${card.scenarioSteps.map((step, index) => renderStep(step, index)).join("")}
              </div>
            </section>
          `
          : ""
      }

      ${renderOptionalListSection("Ce qui fonctionne", card.workingItems, "success")}
      ${renderOptionalListSection("Problèmes détectés", card.problemItems, "danger")}
      ${renderOptionalListSection("Recommandations", card.recommendations, "info")}

      ${
        card.notes
          ? `
            <section class="section-block">
              <h4>Notes</h4>
              <p>${escapeHtml(card.notes)}</p>
            </section>
          `
          : ""
      }

      ${
        card.screenshots.length
          ? `
            <section class="section-block">
              <h4>Images</h4>
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
            <section class="section-block">
              <h4>Références utiles</h4>
              <ul class="bullet-list">
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
  return `
    <div class="step-card step-${escapeAttribute(step.status)}">
      <div class="step-card__head">
        <strong>${index + 1}. ${escapeHtml(step.label)}</strong>
        <span class="pill status-${escapeAttribute(step.status === "ok" ? "validated" : step.status === "ko" ? "failed" : "untested")}">${escapeHtml(step.statusBadgeLabel || step.statusLabel)}</span>
      </div>
      <p class="step-stamp">${escapeHtml(step.testStamp || "Étape non testée pour le moment.")}</p>
      ${
        step.status === "ko" && step.bug
          ? `
            <div class="bug-box">
              <p><strong>Bug:</strong> ${escapeHtml(step.bug.description)}</p>
              <p><strong>Observé:</strong> ${escapeHtml(step.bug.observedBehavior)}</p>
              <p><strong>Attendu:</strong> ${escapeHtml(step.bug.expectedResult)}</p>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderOptionalListSection(title, items, tone) {
  if (!items.length) {
    return "";
  }

  return `
    <section class="section-block">
      <h4>${escapeHtml(title)}</h4>
      <ul class="bullet-list bullet-list--${escapeAttribute(tone)}">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
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

function renderKpi(label, value) {
  return `
    <div class="kpi-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderScopeNote(report, title) {
  return `
    <section class="scope-note">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(report.detailScope.summary)}</p>
      <p>${escapeHtml(report.detailScope.inclusionNote)}</p>
    </section>
  `;
}

function renderUndetailedCardsSection(report) {
  if (!report.undetailedCards.length) {
    return "";
  }

  return `
    <section class="section-block">
      <h3>Cartes non détaillées</h3>
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

function buildPrintableStyles() {
  return `
    @page {
      size: A4;
      margin: 16mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      color: #172033;
      background: #eef3fb;
      font-family: "Segoe UI", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      padding: 24px 0;
    }

    .report-shell {
      width: min(100%, 880px);
      margin: 0 auto;
      display: grid;
      gap: 24px;
    }

    .report-page,
    .report-flow {
      background: #ffffff;
      border: 1px solid #dbe4f0;
      border-radius: 28px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
      padding: 28px;
    }

    .report-page {
      break-after: page;
    }

    .report-flow {
      break-after: auto;
    }

    .report-page:last-child,
    .report-flow:last-child {
      break-after: auto;
    }

    .report-cover {
      background: linear-gradient(145deg, #ffffff 0%, #f7faff 100%);
    }

    .eyebrow {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #4f6b95;
    }

    h1, h2, h3, h4, p {
      margin: 0;
    }

    h1 {
      font-size: 34px;
      line-height: 1;
    }

    h2 {
      font-size: 26px;
      line-height: 1.1;
      margin-bottom: 8px;
    }

    h3 {
      font-size: 18px;
      line-height: 1.2;
    }

    h4 {
      font-size: 14px;
      line-height: 1.3;
      margin-bottom: 10px;
    }

    p {
      line-height: 1.6;
    }

    .lead,
    .page-intro,
    .detail-scenario,
    .detail-path,
    .step-stamp,
    .meta-item span,
    .kpi-item span,
    .surface-card p,
    .surface-card small {
      color: #5d6b85;
    }

    .cover-top {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      align-items: start;
      margin-bottom: 24px;
    }

    .cover-brand {
      display: grid;
      grid-template-columns: 96px 1fr;
      gap: 18px;
      align-items: center;
    }

    .cover-logo {
      width: 96px;
      height: 96px;
      border-radius: 24px;
      border: 1px solid #dbe4f0;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: #ffffff;
    }

    .cover-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .cover-logo-fallback {
      display: none;
      width: 100%;
      height: 100%;
      place-items: center;
      font-size: 28px;
      font-weight: 800;
      color: #1e3a8a;
    }

    .cover-meta,
    .kpi-grid,
    .surface-grid {
      display: grid;
      gap: 12px;
    }

    .cover-meta {
      grid-template-columns: 1fr;
    }

    .meta-item,
    .kpi-item,
    .surface-card,
    .section-block,
    .detail-card,
    .toc-row,
    .empty-card {
      border: 1px solid #dbe4f0;
      border-radius: 20px;
      background: #ffffff;
    }

    .meta-item,
    .kpi-item,
    .surface-card,
    .section-block,
    .detail-card,
    .empty-card {
      padding: 16px;
    }

    .meta-item,
    .kpi-item {
      display: grid;
      gap: 6px;
    }

    .summary-card {
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: 24px;
      background: #f8fbff;
      border: 1px solid #dbe4f0;
    }

    .kpi-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .kpi-item strong {
      font-size: 24px;
      line-height: 1;
    }

    .summary-text {
      color: #31415f;
    }

    .scope-note {
      display: grid;
      gap: 6px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid #dbe4f0;
      background: rgba(255, 255, 255, 0.9);
    }

    .scope-note strong {
      font-size: 12px;
      color: #28456f;
    }

    .scope-note p {
      font-size: 12px;
      color: #42526c;
    }

    .toc-list,
    .step-list,
    .image-grid {
      display: grid;
      gap: 12px;
    }

    .toc-row {
      display: grid;
      grid-template-columns: 44px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      text-decoration: none;
      color: inherit;
    }

    .toc-index {
      font-size: 12px;
      font-weight: 800;
      color: #6a7c9b;
    }

    .toc-copy {
      display: grid;
      gap: 4px;
    }

    .toc-copy small {
      color: #6a7c9b;
    }

    .toc-status,
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .status-validated {
      background: rgba(34, 197, 94, 0.12);
      color: #15803d;
      border-color: rgba(34, 197, 94, 0.18);
    }

    .status-failed {
      background: rgba(239, 68, 68, 0.12);
      color: #dc2626;
      border-color: rgba(239, 68, 68, 0.18);
    }

    .status-partial {
      background: rgba(245, 158, 11, 0.12);
      color: #b45309;
      border-color: rgba(245, 158, 11, 0.18);
    }

    .status-untested {
      background: rgba(148, 163, 184, 0.14);
      color: #64748b;
      border-color: rgba(148, 163, 184, 0.18);
    }

    .severity-blocker {
      background: rgba(239, 68, 68, 0.12);
      color: #dc2626;
      border-color: rgba(239, 68, 68, 0.18);
    }

    .severity-major {
      background: rgba(249, 115, 22, 0.12);
      color: #c2410c;
      border-color: rgba(249, 115, 22, 0.18);
    }

    .severity-minor {
      background: rgba(99, 102, 241, 0.12);
      color: #4f46e5;
      border-color: rgba(99, 102, 241, 0.18);
    }

    .surface-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 18px;
    }

    .undetailed-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .undetailed-card {
      display: grid;
      gap: 4px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px dashed #d0dae8;
      background: #f8fbff;
      break-inside: avoid;
    }

    .undetailed-card small {
      color: #6a7c9b;
    }

    .surface-card {
      display: grid;
      gap: 10px;
    }

    .surface-card__head,
    .detail-card__head,
    .step-card__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .surface-card__stats,
    .detail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      color: #42526c;
      font-size: 12px;
    }

    .section-block {
      display: grid;
      gap: 10px;
      margin-top: 14px;
      break-inside: avoid;
    }

    .detail-intro {
      margin-bottom: 18px;
    }

    .detail-card {
      display: grid;
      gap: 14px;
      margin-bottom: 18px;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }

    .detail-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .detail-path {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .step-card {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid #dbe4f0;
      border-radius: 18px;
      background: #fafcff;
      break-inside: avoid;
    }

    .step-ok {
      border-color: rgba(34, 197, 94, 0.22);
    }

    .step-ko {
      border-color: rgba(239, 68, 68, 0.24);
    }

    .bug-box {
      display: grid;
      gap: 6px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(254, 242, 242, 0.8);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .bullet-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
      line-height: 1.55;
    }

    .bullet-list--success li::marker {
      color: #15803d;
    }

    .bullet-list--danger li::marker {
      color: #dc2626;
    }

    .bullet-list--info li::marker {
      color: #2563eb;
    }

    .image-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .image-card {
      margin: 0;
      border: 1px solid #dbe4f0;
      border-radius: 16px;
      overflow: hidden;
      background: #ffffff;
    }

    .image-card img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #eef3fb;
    }

    .image-card figcaption {
      padding: 10px 12px;
      font-size: 12px;
      color: #5d6b85;
    }

    @media (max-width: 800px) {
      .surface-grid,
      .undetailed-list,
      .image-grid {
        grid-template-columns: 1fr;
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
        border: 0;
        padding: 0;
      }
    }
  `;
}
