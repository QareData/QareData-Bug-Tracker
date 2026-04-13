import { buildContextDescription, buildContextExpected } from "../core/card-context.js";
import { PDF_BRAND } from "../utils/constants.js";
import {
  blockQuoteMarkdown,
  cleanText,
  downloadBlob,
  extractMentions,
  formatFileStamp,
  formatPercent,
  formatReportDate,
  uniqueTexts,
} from "../utils/format.js";
import {
  flattenBoard,
  getBoardMetrics,
  getCardChecklistMetrics,
  getCardRisk,
  getCardStatusMeta,
  getSeverityMeta,
  getSourceStatusMeta,
  getSurfaceMetrics,
} from "../core/state.js";

export function buildReportModel(board, generatedAt = new Date()) {
  const metrics = getBoardMetrics(board);
  const cardDetails = flattenBoard(board).map(({ surface, page, card }) =>
    buildCardDetail(board, surface, page, card),
  );
  const detailCards = cardDetails.filter((card) => card.isTested);
  const undetailedCards = cardDetails
    .filter((card) => !card.isTested)
    .sort(sortDisplayCards);
  const tocCards = detailCards.slice().sort(sortDisplayCards);
  const detailIds = new Set(detailCards.map((card) => card.id));
  const surfaces = board.surfaces
    .map((surface) => ({
      ...surface,
      metrics: getSurfaceMetrics(surface),
      pages: surface.pages
        .map((page) => ({
          ...page,
          cards: page.cards
            .map((card) => buildCardDetail(board, surface, page, card))
            .filter((card) => detailIds.has(card.id)),
        }))
        .filter((page) => page.cards.length > 0),
    }))
    .filter((surface) => surface.pages.length > 0);

  const topProblems = cardDetails
    .filter((card) => card.reportStatus.key === "failed" || card.reportStatus.key === "partial")
    .sort(sortProblemCards)
    .slice(0, 8);
  const reportStats = buildReportStats(metrics, cardDetails);
  const detailScope = buildDetailScope(reportStats);

  return {
    brand: {
      ...PDF_BRAND,
      companyName: board.meta.companyName || PDF_BRAND.companyName,
      projectName: board.meta.projectName || PDF_BRAND.projectName,
      reportName: board.meta.reportName || PDF_BRAND.reportName,
    },
    generatedAt,
    meta: board.meta,
    metrics,
    reportStats,
    detailScope,
    summaryText: buildSummaryText(metrics, reportStats),
    surfaces,
    cardDetails,
    detailCards,
    tocCards,
    undetailedCards,
    topProblems,
  };
}

export function downloadMarkdownReport(board, generatedAt = new Date()) {
  const markdown = buildMarkdownReport(board, generatedAt);
  downloadBlob(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    `qaredata-qa-report-${formatFileStamp(generatedAt)}.md`,
  );
}

export function buildMarkdownReport(board, generatedAt = new Date()) {
  const report = buildReportModel(board, generatedAt);
  const lines = [];

  lines.push(`# ${report.brand.reportName}`);
  lines.push("");
  lines.push(`- Entreprise : ${report.brand.companyName}`);
  lines.push(`- Projet : ${report.brand.projectName}`);
  lines.push(`- Testeur : ${report.meta.tester || "Non renseigné"}`);
  lines.push(`- Environnement : ${report.meta.environment || "Non renseigné"}`);
  lines.push(`- Date de génération : ${formatReportDate(report.generatedAt)}`);
  lines.push("");
  lines.push("## Synthèse");
  lines.push("");
  lines.push(report.summaryText);
  lines.push("");
  lines.push("| Indicateur | Valeur |");
  lines.push("| --- | --- |");
  lines.push(`| Cartes totales | ${report.reportStats.totalCards} |`);
  lines.push(`| Cartes testées | ${report.reportStats.testedCount} |`);
  lines.push(`| Cartes détaillées | ${report.detailScope.detailedCount} |`);
  lines.push(`| Validées | ${report.reportStats.validatedCount} |`);
  lines.push(`| Partielles | ${report.reportStats.partialCount} |`);
  lines.push(`| Échouées | ${report.reportStats.failedCount} |`);
  lines.push(`| Non testées | ${report.reportStats.untestedCount} |`);
  lines.push(`| Score QA global | ${report.reportStats.scorePercent}% |`);
  lines.push(`| Cartes avec notes | ${report.metrics.notesCount} |`);
  lines.push(`| Captures jointes | ${report.metrics.screenshotsCount} |`);
  lines.push("");
  lines.push(`- Périmètre détaillé : ${report.detailScope.summary}`);
  lines.push(`- Règle d'inclusion : ${report.detailScope.inclusionNote}`);
  lines.push("");

  if (report.topProblems.length) {
    lines.push("## Priorités QA");
    lines.push("");
    report.topProblems.forEach((card) => {
      lines.push(
        `- [${card.severity.label}] ${card.title} (${card.surfaceName} / ${card.pageName}) - ${card.reportStatus.label}`,
      );
    });
    lines.push("");
  }

  lines.push("## Avancement par surface");
  lines.push("");
  report.surfaces.forEach((surface) => {
    lines.push(`### ${surface.name}`);
    lines.push("");
    lines.push(`- Score QA : ${surface.metrics.qaScore}/100`);
    lines.push(`- Cartes : ${surface.metrics.totalCards}`);
    lines.push(`- Validées : ${surface.metrics.doneCount}`);
    lines.push(`- En cours : ${surface.metrics.progressCount}`);
    lines.push(`- À lancer : ${surface.metrics.todoCount}`);
    lines.push(`- Bloquants ouverts : ${surface.metrics.blockersCount}`);
    lines.push("");
  });

  lines.push("## Détail des cartes testées");
  lines.push("");

  if (!report.detailCards.length) {
    lines.push("Aucune carte n'a encore été réellement testée ou documentée.");
    lines.push("");
    return lines.join("\n");
  }

  if (report.undetailedCards.length) {
    lines.push("## Cartes non détaillées");
    lines.push("");
    lines.push("Les cartes ci-dessous restent visibles dans le board mais n'entrent pas encore dans le détail du rapport.");
    lines.push("");
    report.undetailedCards.forEach((card) => {
      lines.push(
        `- ${card.title} (${card.surfaceName} / ${card.pageName}) - ${card.reportStatus.label}`,
      );
    });
    lines.push("");
  }

  report.surfaces.forEach((surface) => {
    lines.push(`### ${surface.name}`);
    lines.push("");

    surface.pages.forEach((page) => {
      lines.push(`#### ${page.name}`);
      lines.push("");

      page.cards.forEach((card) => {
        appendCardMarkdown(lines, card, report.meta);
      });
    });
  });

  return lines.join("\n");
}

function appendCardMarkdown(lines, card, boardMeta) {
  lines.push(`##### ${card.title}`);
  lines.push("");
  lines.push(`- Statut global : ${card.reportStatus.label}`);
  lines.push(`- Statut QA : ${card.status.label}`);
  lines.push(`- Criticité : ${card.severity.label}`);
  lines.push(`- Statut source : ${card.sourceStatus.label}`);
  lines.push(`- Scénario utilisateur : ${card.scenarioTitle}`);
  lines.push(`- Progression des étapes : ${card.checklist.checked}/${card.checklist.total} (${card.checklist.progressPercent}%)`);
  lines.push(`- Testeur : ${card.tester || boardMeta.tester || "Non renseigné"}`);
  lines.push(`- Environnement : ${card.environment || boardMeta.environment || "Non renseigné"}`);
  lines.push("");

  lines.push("**Description du test**");
  lines.push("");
  lines.push(card.testDescription);
  lines.push("");

  if (card.expectedResult) {
    lines.push("**Résultat attendu**");
    lines.push("");
    lines.push(card.expectedResult);
    lines.push("");
  }

  if (card.scenarioSteps.length) {
    lines.push("**Scénario utilisateur**");
    lines.push("");
    card.scenarioSteps.forEach((step, index) => {
      lines.push(`- ${index + 1}. ${step.icon} ${step.label} (${step.statusLabel})`);
      if (step.testStamp) {
        lines.push(`  ${step.testStamp}`);
      }
      if (step.status === "ko" && step.bug) {
        lines.push(`  Bug : ${step.bug.description}`);
        lines.push(`  Observé : ${step.bug.observedBehavior}`);
        lines.push(`  Attendu : ${step.bug.expectedResult}`);
      }
    });
    lines.push("");
  }

  appendList(
    lines,
    "Ce qui fonctionne",
    card.workingItems,
  );
  appendList(
    lines,
    "Problèmes détectés",
    card.problemItems,
  );
  appendList(
    lines,
    "Recommandations",
    card.recommendations,
  );

  if (card.notes) {
    lines.push("**Notes**");
    lines.push("");
    lines.push(blockQuoteMarkdown(card.notes));
    lines.push("");
  }

  if (card.screenshots.length) {
    appendList(
      lines,
      "Images",
      card.screenshots.map((shot) => shot.name),
    );
  }

  if (card.references.length) {
    appendList(lines, "Références utiles", card.references);
  }
}

function buildCardDetail(board, surface, page, card) {
  const checklistMetrics = getCardChecklistMetrics(card);
  const scenarioSteps = card.checklist.map((item) => buildScenarioStepDetail(item, board.meta));
  const severity = getSeverityMeta(card.severity);
  const status = getCardStatusMeta(card.status);
  const reportStatus = getCardReportStatus(card, scenarioSteps);
  const mentions = extractMentions([
    ...card.references,
    card.notes,
    ...card.sourceIssues,
    ...card.advice,
  ]);

  return {
    id: card.id,
    title: card.title,
    scenarioTitle: cleanText(card.scenarioTitle || card.title) || card.title,
    surfaceId: surface.id,
    surfaceName: surface.name,
    pageId: page.id,
    pageName: page.name,
    status,
    severity: {
      ...severity,
      badgeLabel: buildSeverityBadgeLabel(severity),
    },
    sourceStatus: getSourceStatusMeta(card.sourceStatus),
    checklist: checklistMetrics,
    scenarioSteps,
    isTested: isCardTested(card, scenarioSteps),
    reportStatus: {
      ...reportStatus,
      badgeLabel: getReportStatusBadgeLabel(reportStatus.key),
    },
    testDescription: buildTestDescription(card),
    expectedResult: buildContextExpected(card),
    workingItems: buildWorkingItems(card, scenarioSteps),
    problemItems: buildProblemItems(card, scenarioSteps),
    recommendations: buildRecommendations(card, scenarioSteps),
    notes: String(card.notes || "").trim(),
    tester: card.tester || board.meta.tester || "",
    environment: card.environment || board.meta.environment || "",
    screenshots: card.screenshots,
    references: uniqueTexts([...card.references, ...mentions]),
    risk: getCardRisk(card),
  };
}

function buildScenarioStepDetail(step, boardMeta = {}) {
  const status = step.status || "pending";
  const tester = step.tester || boardMeta.tester || "";

  return {
    id: step.id,
    label: cleanText(step.label) || "Étape utilisateur",
    status,
    statusLabel: getStepStatusLabel(status),
    statusBadgeLabel: getStepStatusBadgeLabel(status),
    icon: getStepStatusIcon(status),
    tester,
    timestamp: step.timestamp || "",
    testStamp: buildStepStamp(step.timestamp, tester, status),
    bug: status === "ko" ? normalizeBug(step.bug) : null,
  };
}

function buildReportStats(metrics, cardDetails) {
  const testedCount = cardDetails.filter((card) => card.isTested).length;
  const validatedCount = cardDetails.filter((card) => card.reportStatus.key === "validated").length;
  const partialCount = cardDetails.filter((card) => card.reportStatus.key === "partial").length;
  const failedCount = cardDetails.filter((card) => card.reportStatus.key === "failed").length;

  return {
    totalCards: metrics.totalCards,
    testedCount,
    validatedCount,
    partialCount,
    failedCount,
    untestedCount: Math.max(0, metrics.totalCards - testedCount),
    scorePercent: metrics.qaScore,
  };
}

function buildDetailScope(reportStats) {
  const detailedCount = reportStats.testedCount;
  const totalCount = reportStats.totalCards;
  const omittedCount = Math.max(0, totalCount - detailedCount);

  return {
    detailedCount,
    totalCount,
    omittedCount,
    summary: omittedCount
      ? `${detailedCount} carte(s) détaillée(s) sur ${totalCount}. ${omittedCount} carte(s) restent hors détail car elles ne sont pas encore testées ou documentées.`
      : `Les ${detailedCount} carte(s) du périmètre sont détaillées dans ce document.`,
    inclusionNote: "Une carte entre dans le détail dès qu'au moins une étape a été jouée, ou si des notes, captures ou un statut QA hors « À lancer » sont déjà présents.",
    tocIntro: omittedCount
      ? `${detailedCount} carte(s) détaillée(s) sur ${totalCount}. Les cartes non détaillées restent visibles dans la synthèse globale.`
      : `Toutes les cartes du périmètre sont détaillées dans ce document.`,
    detailIntro: omittedCount
      ? `${detailedCount} carte(s) détaillée(s) dans cette section sur ${totalCount} au total. ${omittedCount} carte(s) non encore testées restent hors détail.`
      : `${detailedCount} carte(s) détaillée(s) dans cette section. Toutes les cartes du périmètre sont couvertes.`,
  };
}

function isCardTested(card, scenarioSteps) {
  return Boolean(
    scenarioSteps.some((step) => step.status !== "pending")
      || String(card.notes || "").trim()
      || card.screenshots.length
      || card.status !== "todo",
  );
}

function getCardReportStatus(card, scenarioSteps) {
  const okCount = scenarioSteps.filter((step) => step.status === "ok").length;
  const koCount = scenarioSteps.filter((step) => step.status === "ko").length;
  const testedCount = scenarioSteps.filter((step) => step.status !== "pending").length;

  if (koCount > 0) {
    return {
      key: "failed",
      label: "Échoué",
      tone: "blocker",
    };
  }

  if ((scenarioSteps.length && okCount === scenarioSteps.length) || card.status === "done") {
    return {
      key: "validated",
      label: "Validé",
      tone: "done",
    };
  }

  if (testedCount > 0 || card.status === "progress" || card.notes.trim() || card.screenshots.length) {
    return {
      key: "partial",
      label: "Partiel",
      tone: "progress",
    };
  }

  return {
    key: "untested",
    label: "Non testé",
    tone: "todo",
  };
}

function buildTestDescription(card) {
  const scenarioTitle = cleanText(card.scenarioTitle || card.title) || card.title;
  const contextDescription = buildContextDescription(card);

  return cleanText([
    `Vérifier le scénario utilisateur "${scenarioTitle}" dans des conditions proches d'un usage réel et confirmer que le flux reste exploitable sans friction majeure.`,
    contextDescription,
  ]
    .filter(Boolean)
    .join(" "));
}

function buildWorkingItems(card, scenarioSteps) {
  return uniqueTexts([
    ...scenarioSteps.filter((step) => step.status === "ok").map((step) => step.label),
    ...card.validatedPoints,
  ]);
}

function buildProblemItems(card, scenarioSteps) {
  const failingSteps = scenarioSteps
    .filter((step) => step.status === "ko")
    .map((step) => {
      const bug = step.bug || {};
      const summary = cleanText([
        `Étape en échec : ${step.label}.`,
        bug.description ? `Bug : ${bug.description}.` : "",
        bug.observedBehavior ? `Observé : ${bug.observedBehavior}.` : "",
        bug.expectedResult ? `Attendu : ${bug.expectedResult}.` : "",
      ].join(" "));
      return summary;
    });

  if (!failingSteps.length && card.sourceStatus === "source-todo") {
    return [
      "Le flux reste signalé comme nécessitant un correctif côté produit avant validation finale.",
    ];
  }

  return uniqueTexts(failingSteps);
}

function buildRecommendations(card, scenarioSteps) {
  const failingSteps = scenarioSteps.filter((step) => step.status === "ko");
  const items = failingSteps.map((step) => {
    const expected = step.bug?.expectedResult
      ? ` afin d'obtenir le résultat attendu suivant : ${step.bug.expectedResult}`
      : "";
    return `Corriger l'étape "${step.label}"${expected}.`;
  });

  if (failingSteps.length) {
    items.push("Rejouer le scénario complet après correction pour valider la non-régression.");
  }

  if (failingSteps.length && card.severity === "blocker") {
    items.push("Traiter ce point avant une validation finale ou une ouverture plus large de la recette.");
  }

  if (!failingSteps.length && card.status === "progress") {
    items.push("Finaliser les étapes restantes pour obtenir une décision QA complète sur cette carte.");
  }

  return uniqueTexts(items);
}

function buildSummaryText(metrics, reportStats) {
  const coverageText = formatPercent(reportStats.testedCount, metrics.totalCards);

  return [
    `${metrics.totalCards} carte(s) sont dans le périmètre courant.`,
    `${reportStats.testedCount} carte(s) ont déjà été rejouées, soit ${coverageText} de couverture.`,
    `${reportStats.validatedCount} carte(s) sont validées, ${reportStats.partialCount} restent partielles et ${reportStats.failedCount} sont en échec.`,
    `Le score QA global atteint ${reportStats.scorePercent}%, avec ${metrics.blockersCount} point(s) bloquant(s) encore ouvert(s).`,
    `${metrics.notesCount} carte(s) contiennent des notes terrain et ${metrics.screenshotsCount} capture(s) sont déjà jointes au board.`,
  ].join(" ");
}

function buildStepStamp(timestamp, tester, status) {
  const segments = [getStepStatusLabel(status)];

  if (tester) {
    segments.push(`par ${tester}`);
  }

  if (timestamp) {
    const value = new Date(timestamp);
    if (!Number.isNaN(value.getTime())) {
      segments.push(
        value.toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
  }

  return segments.join(" · ");
}

function normalizeBug(bug = {}) {
  return {
    description: cleanText(bug.description),
    observedBehavior: cleanText(bug.observedBehavior),
    expectedResult: cleanText(bug.expectedResult),
  };
}

function getStepStatusLabel(status) {
  switch (status) {
    case "ok":
      return "Validé";
    case "ko":
      return "Échoué";
    default:
      return "Non testé";
  }
}

function getStepStatusBadgeLabel(status) {
  switch (status) {
    case "ok":
      return "OK";
    case "ko":
      return "KO";
    default:
      return "NT";
  }
}

function getStepStatusIcon(status) {
  switch (status) {
    case "ok":
      return "✔";
    case "ko":
      return "✖";
    default:
      return "•";
  }
}

function getReportStatusBadgeLabel(key) {
  switch (key) {
    case "validated":
      return "OK VALIDÉ";
    case "failed":
      return "KO ÉCHOUÉ";
    case "partial":
      return "EN COURS";
    default:
      return "NON TESTÉ";
  }
}

function buildSeverityBadgeLabel(severity) {
  return `${severity.shortLabel} ${severity.label.toUpperCase()}`;
}

function sortProblemCards(left, right) {
  const severityDelta = left.severity.rank - right.severity.rank;
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const riskDelta = Number(right.risk) - Number(left.risk);
  if (riskDelta !== 0) {
    return riskDelta;
  }

  return left.title.localeCompare(right.title, "fr");
}

function sortDisplayCards(left, right) {
  const surfaceDelta = left.surfaceName.localeCompare(right.surfaceName, "fr");
  if (surfaceDelta !== 0) {
    return surfaceDelta;
  }

  const pageDelta = left.pageName.localeCompare(right.pageName, "fr");
  if (pageDelta !== 0) {
    return pageDelta;
  }

  const severityDelta = left.severity.rank - right.severity.rank;
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const statusDelta = getReportStatusSortRank(left.reportStatus.key) - getReportStatusSortRank(right.reportStatus.key);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return left.title.localeCompare(right.title, "fr");
}

function getReportStatusSortRank(key) {
  switch (key) {
    case "failed":
      return 0;
    case "partial":
      return 1;
    case "validated":
      return 2;
    default:
      return 3;
  }
}

function appendList(lines, title, items = []) {
  if (!items.length) {
    return;
  }

  lines.push(`**${cleanText(title)}**`);
  lines.push("");
  items.forEach((item) => {
    lines.push(`- ${cleanText(item)}`);
  });
  lines.push("");
}
