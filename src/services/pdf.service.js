import { PDF_LIBRARY_SOURCES } from "../utils/constants.js?v=20260407-pdf-phase1-1";
import {
  cleanText,
  formatFileStamp,
  formatReportDate,
  truncateText,
} from "../utils/format.js?v=20260407-pdf-phase1-1";
import { buildReportModel } from "./report.service.js?v=20260407-pdf-phase1-1";
import { buildPrintablePdfDocument } from "./pdf.template.js?v=20260407-pdf-phase1-1";

const PAGE_MARGIN_X = 46;
const PAGE_MARGIN_TOP = 54;
const PAGE_MARGIN_BOTTOM = 44;
const SECTION_GAP = 16;
const TOC_ROWS_PER_PAGE = 22;
const IMAGE_CACHE = new Map();

export async function generatePdfReport(board) {
  const generatedAt = new Date();
  const report = buildReportModel(board, generatedAt);

  try {
    await ensurePdfEngineLoaded();
    await generateWithJsPdf(report, generatedAt);
    return {
      mode: "download",
    };
  } catch (error) {
    console.warn("Fallback impression PDF activé.", error);
    await openPrintableFallback(report);
    return {
      mode: "print",
    };
  }
}

async function generateWithJsPdf(report, generatedAt) {
  const jsPdfCtor = window.jspdf?.jsPDF;
  if (!jsPdfCtor) {
    throw new Error("Impossible d'initialiser jsPDF.");
  }

  const pdf = new jsPdfCtor({
    unit: "pt",
    format: "a4",
    orientation: "portrait",
  });
  const layout = getLayout(pdf);
  const logoAsset = await loadImageAsset(report.brand.logoPath).catch(() => null);
  const tocPageNumbers = reserveTocPages(pdf, report.tocCards);
  const cardPageMap = await drawDetailPages(pdf, layout, report);

  drawCoverPage(pdf, layout, report, logoAsset);
  drawTocPages(pdf, layout, report, tocPageNumbers, cardPageMap);
  decoratePdf(pdf, layout, report);

  pdf.save(`qaredata-qa-report-${formatFileStamp(generatedAt)}.pdf`);
}

async function ensurePdfEngineLoaded() {
  if (window.jspdf?.jsPDF) {
    return;
  }

  for (const source of PDF_LIBRARY_SOURCES) {
    try {
      await loadScript(source.src);
      if (window.jspdf?.jsPDF) {
        return;
      }
    } catch {
      // try next source
    }
  }

  throw new Error("Impossible de charger le moteur PDF.");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    let existing = document.querySelector(`script[data-pdf-lib="${src}"]`);
    if (existing) {
      if (existing.dataset.failed === "true") {
        existing.remove();
        existing = null;
      }
    }

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Erreur de chargement ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.pdfLib = src;
    script.crossOrigin = "anonymous";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        script.dataset.failed = "true";
        reject(new Error(`Erreur de chargement ${src}`));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
}

function openPrintableFallback(report) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 1500);
    };

    iframe.addEventListener("load", () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        cleanup();
        reject(new Error("Fenêtre d'impression indisponible."));
        return;
      }

      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
          cleanup();
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }, 300);
    }, { once: true });

    iframe.srcdoc = buildPrintablePdfDocument(report, {
      baseHref: window.location.href,
    });
    document.body.appendChild(iframe);
  });
}

function getLayout(pdf) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  return {
    width,
    height,
    left: PAGE_MARGIN_X,
    right: width - PAGE_MARGIN_X,
    top: PAGE_MARGIN_TOP,
    bottom: height - PAGE_MARGIN_BOTTOM,
    contentWidth: width - PAGE_MARGIN_X * 2,
  };
}

function reserveTocPages(pdf, tocCards) {
  const pagesNeeded = Math.max(1, Math.ceil(Math.max(tocCards.length, 1) / TOC_ROWS_PER_PAGE));
  const pages = [];

  for (let index = 0; index < pagesNeeded; index += 1) {
    pdf.addPage();
    pages.push(pdf.internal.getNumberOfPages());
  }

  return pages;
}

function drawCoverPage(pdf, layout, report, logoAsset) {
  pdf.setPage(1);
  pdf.setFillColor(246, 249, 255);
  pdf.rect(0, 0, layout.width, layout.height, "F");

  pdf.setFillColor(222, 235, 255);
  pdf.circle(92, 90, 74, "F");
  pdf.setFillColor(225, 246, 240);
  pdf.circle(layout.width - 84, 126, 58, "F");

  const centerX = layout.width / 2;
  let y = 74;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(15, 23, 42);
  pdf.text(report.brand.companyName, centerX, y, { align: "center" });
  y += 30;

  if (logoAsset) {
    const logoSize = fitIntoBox(logoAsset.width, logoAsset.height, 112, 76);
    const logoX = centerX - logoSize.width / 2;
    pdf.addImage(
      logoAsset.dataUrl,
      logoAsset.format,
      logoX,
      y,
      logoSize.width,
      logoSize.height,
      undefined,
      "FAST",
    );
    y += logoSize.height + 26;
  } else {
    pdf.setFillColor(15, 23, 42);
    pdf.roundedRect(centerX - 42, y, 84, 58, 14, 14, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.setTextColor(255, 255, 255);
    pdf.text(report.brand.logoFallback || "QA", centerX, y + 37, { align: "center" });
    y += 84;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(15, 23, 42);
  pdf.text(report.brand.reportName, centerX, y, { align: "center" });
  y += 20;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(88, 102, 122);
  pdf.text(report.brand.projectName, centerX, y, { align: "center" });
  y += 34;

  const metaWidth = 160;
  const metaGap = 14;
  const metaStartX = centerX - ((metaWidth * 3) + (metaGap * 2)) / 2;
  renderCoverMeta(pdf, metaStartX, y, metaWidth, "Testeur", report.meta.tester || "Non renseigné");
  renderCoverMeta(
    pdf,
    metaStartX + metaWidth + metaGap,
    y,
    metaWidth,
    "Environnement",
    report.meta.environment || "Non renseigné",
  );
  renderCoverMeta(
    pdf,
    metaStartX + (metaWidth + metaGap) * 2,
    y,
    metaWidth,
    "Date de génération",
    formatReportDate(report.generatedAt),
  );

  y += 122;

  pdf.setDrawColor(223, 231, 243);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(layout.left, y, layout.contentWidth, 122, 18, 18, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(86, 102, 122);
  pdf.text("Résumé global", layout.left + 22, y + 24);

  const kpiY = y + 40;
  const kpiGap = 10;
  const kpiWidth = (layout.contentWidth - kpiGap * 4) / 5;
  const kpis = [
    ["Cartes totales", String(report.reportStats.totalCards), [71, 85, 105]],
    ["Cartes détaillées", String(report.detailScope.detailedCount), [37, 99, 235]],
    ["Validées", String(report.reportStats.validatedCount), [5, 150, 105]],
    ["Échouées", String(report.reportStats.failedCount), [220, 38, 38]],
    ["Score QA", `${report.reportStats.scorePercent}%`, [37, 99, 235]],
  ];

  kpis.forEach(([label, value, tone], index) => {
    const x = layout.left + index * (kpiWidth + kpiGap);
    drawCoverKpi(pdf, x, kpiY, kpiWidth, label, value, tone);
  });

  y += 150;

  const summaryLines = pdf.splitTextToSize(report.summaryText, layout.contentWidth - 44);
  const detailScopeSummaryLines = pdf.splitTextToSize(
    report.detailScope.summary,
    layout.contentWidth - 44,
  );
  const detailScopeRuleLines = pdf.splitTextToSize(
    report.detailScope.inclusionNote,
    layout.contentWidth - 44,
  );
  const summaryBoxHeight = 84
    + summaryLines.length * 14
    + detailScopeSummaryLines.length * 13
    + detailScopeRuleLines.length * 13
    + 18;

  pdf.setDrawColor(223, 231, 243);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(layout.left, y, layout.contentWidth, summaryBoxHeight, 18, 18, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(86, 102, 122);
  pdf.text("Synthèse QA", layout.left + 22, y + 24);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.text(summaryLines, layout.left + 22, y + 48);

  let scopeY = y + 48 + summaryLines.length * 14 + 10;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(37, 99, 235);
  pdf.text("PÉRIMÈTRE DU DÉTAIL", layout.left + 22, scopeY);
  scopeY += 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(detailScopeSummaryLines, layout.left + 22, scopeY);
  scopeY += detailScopeSummaryLines.length * 13 + 4;
  pdf.text(detailScopeRuleLines, layout.left + 22, scopeY);
}

function renderCoverMeta(pdf, x, y, width, label, value) {
  pdf.setDrawColor(225, 231, 241);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, 82, 16, 16, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label.toUpperCase(), x + 14, y + 22);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  const lines = pdf.splitTextToSize(cleanText(value), width - 28).slice(0, 3);
  pdf.text(lines, x + 14, y + 44);
}

function drawCoverKpi(pdf, x, y, width, label, value, rgb) {
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(229, 234, 241);
  pdf.roundedRect(x, y, width, 62, 16, 16, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...rgb);
  pdf.text(label.toUpperCase(), x + 12, y + 20);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(15, 23, 42);
  pdf.text(String(value), x + 12, y + 48);
}

async function drawDetailPages(pdf, layout, report) {
  pdf.addPage();
  const state = createFlowState(pdf, layout);
  const cardPageMap = {};

  drawDetailIntro(state, report);

  if (!report.detailCards.length) {
    drawInfoBox(state, "Aucune carte détaillée", [
      report.detailScope.summary,
      report.detailScope.inclusionNote,
    ]);
    return cardPageMap;
  }

  for (const card of report.detailCards) {
    ensureSpace(state, 110);
    cardPageMap[card.id] = state.pageNumber;
    await drawCardSection(state, card);
  }

  return cardPageMap;
}

function createFlowState(pdf, layout) {
  return {
    pdf,
    layout,
    pageNumber: pdf.internal.getNumberOfPages(),
    y: layout.top,
  };
}

function addFlowPage(state) {
  state.pdf.addPage();
  state.pageNumber = state.pdf.internal.getNumberOfPages();
  state.y = state.layout.top;
}

function ensureSpace(state, requiredHeight, options = {}) {
  if (state.y + requiredHeight <= state.layout.bottom) {
    return false;
  }

  addFlowPage(state);

  if (options.continuedTitle) {
    drawSectionLabel(state, `${options.continuedTitle} (suite)`);
  }

  return true;
}

function drawDetailIntro(state, report) {
  const { pdf, layout } = state;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(37, 99, 235);
  pdf.text("DÉTAIL DES CARTES TESTÉES", layout.left, state.y);
  state.y += 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Rapport détaillé des vérifications QA", layout.left, state.y);
  state.y += 22;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(88, 102, 122);
  const introLines = pdf.splitTextToSize(
    `${report.detailScope.detailIntro} Chaque fiche rassemble le scénario utilisateur, les étapes réellement testées, les constats observés, les éventuels bugs, les notes et les captures présentes. ${report.detailScope.inclusionNote}`,
    layout.contentWidth,
  );
  pdf.text(introLines, layout.left, state.y);
  state.y += introLines.length * 15 + 12;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(layout.left, state.y, layout.right, state.y);
  state.y += 18;
}

async function drawCardSection(state, card) {
  drawCardHeader(state, card);
  drawParagraphSection(state, "Description du test", card.testDescription);
  drawScenarioSection(state, card);
  drawParagraphSection(state, "Résultat attendu", card.expectedResult);
  drawObservedSection(state, card);

  if (card.notes) {
    drawParagraphSection(state, "Notes", card.notes);
  }

  if (card.screenshots.length) {
    await drawScreenshotsSection(state, card);
  }

  if (card.references.length) {
    drawBulletSection(state, "Références utiles", card.references, {
      continuedTitle: "Références utiles",
      bulletColor: [37, 99, 235],
    });
  }

  state.pdf.setDrawColor(226, 232, 240);
  state.pdf.line(state.layout.left, state.y, state.layout.right, state.y);
  state.y += 20;
}

function drawCardHeader(state, card) {
  const { pdf, layout } = state;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  const statusBadgeLabel = card.reportStatus.badgeLabel || card.reportStatus.label;
  const pillWidth = Math.max(96, pdf.getTextWidth(statusBadgeLabel.toUpperCase()) + 24);
  const titleMaxWidth = layout.contentWidth - pillWidth - 34;
  const titleLines = pdf.splitTextToSize(card.title, titleMaxWidth);
  const headerHeight = 54 + titleLines.length * 18;

  ensureSpace(state, headerHeight + 12);

  const tone = getStatusTone(card.reportStatus.key);
  pdf.setFillColor(...tone.soft);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(layout.left, state.y, layout.contentWidth, headerHeight, 18, 18, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(88, 102, 122);
  pdf.text(`${cleanText(card.surfaceName)} · ${cleanText(card.pageName)}`.toUpperCase(), layout.left + 18, state.y + 20);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text(titleLines, layout.left + 18, state.y + 42);

  drawStatusPill(
    pdf,
    layout.right - pillWidth,
    state.y + 16,
    pillWidth - 8,
    24,
    statusBadgeLabel,
    tone,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(71, 85, 105);
  const metaLine = [
    `Statut QA : ${card.status.label}`,
    `Criticité : ${card.severity.badgeLabel || card.severity.label}`,
    `Testeur : ${card.tester || "Non renseigné"}`,
    `Environnement : ${card.environment || "Non renseigné"}`,
  ].join("   ·   ");
  const metaLines = pdf.splitTextToSize(metaLine, layout.contentWidth - 36);
  pdf.text(metaLines, layout.left + 18, state.y + headerHeight - 16);

  state.y += headerHeight + 12;
}

function drawStatusPill(pdf, x, y, width, height, label, tone) {
  pdf.setFillColor(...tone.fill);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(x, y, width, height, 12, 12, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...tone.text);
  pdf.text(label.toUpperCase(), x + width / 2, y + 16, { align: "center" });
}

function drawSectionLabel(state, label) {
  ensureSpace(state, 22);
  state.pdf.setFont("helvetica", "bold");
  state.pdf.setFontSize(11);
  state.pdf.setTextColor(37, 99, 235);
  state.pdf.text(label.toUpperCase(), state.layout.left, state.y);
  state.y += 16;
}

function drawParagraphSection(state, title, text) {
  if (!cleanText(text)) {
    return;
  }

  drawSectionLabel(state, title);
  const lines = state.pdf.splitTextToSize(cleanText(text), state.layout.contentWidth);

  state.pdf.setFont("helvetica", "normal");
  state.pdf.setFontSize(11);
  state.pdf.setTextColor(51, 65, 85);

  for (const line of lines) {
    ensureSpace(state, 15, { continuedTitle: title });
    state.pdf.text(line, state.layout.left, state.y);
    state.y += 15;
  }

  state.y += 8;
}

function drawScenarioSection(state, card) {
  if (!card.scenarioSteps.length) {
    return;
  }

  drawSectionLabel(state, "Scénario utilisateur");
  drawSubsectionTitle(state, card.scenarioTitle);

  for (const [index, item] of card.scenarioSteps.entries()) {
    const badgeWidth = 84;
    const contentWidth = state.layout.contentWidth - badgeWidth - 26;
    const titleLines = state.pdf.splitTextToSize(`${index + 1}. ${cleanText(item.label)}`, contentWidth);
    const metaLines = state.pdf.splitTextToSize(
      cleanText(item.testStamp || "Étape non testée pour le moment."),
      contentWidth,
    );
    const bugBlocks = item.status === "ko"
      ? [
          ...state.pdf.splitTextToSize(`Bug : ${cleanText(item.bug?.description)}`, contentWidth),
          ...state.pdf.splitTextToSize(`Observé : ${cleanText(item.bug?.observedBehavior)}`, contentWidth),
          ...state.pdf.splitTextToSize(`Attendu : ${cleanText(item.bug?.expectedResult)}`, contentWidth),
        ]
      : [];
    const itemHeight = Math.max(
      52,
      20
        + titleLines.length * 14
        + metaLines.length * 12
        + (bugBlocks.length ? bugBlocks.length * 12 + 12 : 0),
    );

    if (ensureSpace(state, itemHeight + 8, { continuedTitle: "Scénario utilisateur" })) {
      drawSubsectionTitle(state, `${card.scenarioTitle} (suite)`);
    }

    state.pdf.setDrawColor(226, 232, 240);
    state.pdf.setFillColor(255, 255, 255);
    state.pdf.roundedRect(
      state.layout.left,
      state.y,
      state.layout.contentWidth,
      itemHeight,
      12,
      12,
      "FD",
    );

    let cursorY = state.y + 18;
    state.pdf.setFont("helvetica", "bold");
    state.pdf.setFontSize(11);
    state.pdf.setTextColor(15, 23, 42);
    state.pdf.text(titleLines, state.layout.left + 12, cursorY);
    cursorY += titleLines.length * 14 + 2;

    state.pdf.setFont("helvetica", "normal");
    state.pdf.setFontSize(9.5);
    state.pdf.setTextColor(100, 116, 139);
    state.pdf.text(metaLines, state.layout.left + 12, cursorY);
    cursorY += metaLines.length * 12 + 2;

    if (bugBlocks.length) {
      cursorY += 4;
      state.pdf.setFont("helvetica", "normal");
      state.pdf.setFontSize(9.5);
      state.pdf.setTextColor(185, 28, 28);
      state.pdf.text(bugBlocks, state.layout.left + 12, cursorY);
    }

    drawSmallBadge(
      state.pdf,
      state.layout.right - badgeWidth,
      state.y + 8,
      badgeWidth - 10,
      18,
      item.statusBadgeLabel || item.statusLabel,
      getStatusTone(item.status === "ok" ? "validated" : item.status === "ko" ? "failed" : "untested"),
    );

    state.y += itemHeight + 8;
  }

  state.y += 4;
}

function drawObservedSection(state, card) {
  drawSectionLabel(state, "Résultats observés");

  let hasContent = false;

  if (card.workingItems.length) {
    hasContent = true;
    drawBulletSection(state, "Ce qui fonctionne", card.workingItems, {
      continuedTitle: "Résultats observés",
      bulletColor: [5, 150, 105],
    });
  }

  if (card.problemItems.length) {
    hasContent = true;
    drawBulletSection(state, "Problèmes détectés", card.problemItems, {
      continuedTitle: "Résultats observés",
      bulletColor: [220, 38, 38],
    });
  }

  if (card.recommendations.length) {
    hasContent = true;
    drawBulletSection(state, "Recommandations", card.recommendations, {
      continuedTitle: "Résultats observés",
      bulletColor: [37, 99, 235],
    });
  }

  if (!hasContent) {
    const fallback =
      card.reportStatus.key === "validated"
        ? "Aucun dysfonctionnement n'a été remonté sur cette carte."
        : "La carte reste à documenter plus finement pour consolider les constats terrain.";
    drawParagraphSection(state, "Constat", fallback);
  }
}

function drawBulletSection(state, title, items, options = {}) {
  if (!items.length) {
    return;
  }

  const bulletColor = options.bulletColor || [37, 99, 235];
  drawSubsectionTitle(state, title);

  for (const item of items) {
    const lines = state.pdf.splitTextToSize(cleanText(item), state.layout.contentWidth - 18);
    const itemHeight = lines.length * 14 + 4;

    if (ensureSpace(state, itemHeight + 4, { continuedTitle: options.continuedTitle || title })) {
      drawSubsectionTitle(state, `${title} (suite)`);
    }

    state.pdf.setFillColor(...bulletColor);
    state.pdf.circle(state.layout.left + 4, state.y + 5, 2.2, "F");
    state.pdf.setFont("helvetica", "normal");
    state.pdf.setFontSize(11);
    state.pdf.setTextColor(51, 65, 85);
    state.pdf.text(lines, state.layout.left + 14, state.y + 8);
    state.y += itemHeight;
  }

  state.y += 6;
}

function drawSubsectionTitle(state, title) {
  const lines = state.pdf.splitTextToSize(cleanText(title), state.layout.contentWidth);
  ensureSpace(state, Math.max(18, lines.length * 12 + 6));
  state.pdf.setFont("helvetica", "bold");
  state.pdf.setFontSize(10);
  state.pdf.setTextColor(100, 116, 139);
  state.pdf.text(lines, state.layout.left, state.y);
  state.y += lines.length * 12;
}

async function drawScreenshotsSection(state, card) {
  drawSectionLabel(state, "Images");

  const gutter = 12;
  const imageWidth = (state.layout.contentWidth - gutter) / 2;
  const maxImageHeight = 150;
  let x = state.layout.left;
  let rowHeight = 0;
  let columnIndex = 0;

  for (const shot of card.screenshots) {
    const asset = await loadImageAsset(shot.dataUrl).catch(() => null);
    if (!asset) {
      continue;
    }

    const fitted = fitIntoBox(asset.width, asset.height, imageWidth, maxImageHeight);
    const blockHeight = fitted.height + 26;

    if (columnIndex === 0) {
      ensureSpace(state, blockHeight + 8, { continuedTitle: "Images" });
      x = state.layout.left;
      rowHeight = 0;
    } else if (state.y + blockHeight > state.layout.bottom) {
      state.y += rowHeight + 8;
      ensureSpace(state, blockHeight + 8, { continuedTitle: "Images" });
      x = state.layout.left;
      columnIndex = 0;
      rowHeight = 0;
    }

    const offsetX = x + (imageWidth - fitted.width) / 2;

    state.pdf.setDrawColor(226, 232, 240);
    state.pdf.setFillColor(255, 255, 255);
    state.pdf.roundedRect(x, state.y, imageWidth, blockHeight, 14, 14, "FD");
    state.pdf.addImage(
      asset.dataUrl,
      asset.format,
      offsetX,
      state.y + 10,
      fitted.width,
      fitted.height,
      undefined,
      "FAST",
    );

    state.pdf.setFont("helvetica", "normal");
    state.pdf.setFontSize(10);
    state.pdf.setTextColor(100, 116, 139);
    const caption = truncateText(cleanText(shot.name || "Capture"), 46);
    state.pdf.text(caption, x + imageWidth / 2, state.y + blockHeight - 8, {
      align: "center",
    });

    rowHeight = Math.max(rowHeight, blockHeight);
    columnIndex += 1;

    if (columnIndex === 2) {
      state.y += rowHeight + 8;
      columnIndex = 0;
      rowHeight = 0;
    } else {
      x += imageWidth + gutter;
    }
  }

  if (columnIndex !== 0) {
    state.y += rowHeight + 8;
  }
}

function drawInfoBox(state, title, paragraphs) {
  ensureSpace(state, 110);
  state.pdf.setFillColor(255, 255, 255);
  state.pdf.setDrawColor(226, 232, 240);
  state.pdf.roundedRect(state.layout.left, state.y, state.layout.contentWidth, 102, 16, 16, "FD");

  state.pdf.setFont("helvetica", "bold");
  state.pdf.setFontSize(14);
  state.pdf.setTextColor(15, 23, 42);
  state.pdf.text(title, state.layout.left + 16, state.y + 22);

  state.pdf.setFont("helvetica", "normal");
  state.pdf.setFontSize(11);
  state.pdf.setTextColor(71, 85, 105);
  let y = state.y + 42;
  paragraphs.forEach((paragraph) => {
    const lines = state.pdf.splitTextToSize(cleanText(paragraph), state.layout.contentWidth - 32);
    state.pdf.text(lines, state.layout.left + 16, y);
    y += lines.length * 14 + 6;
  });

  state.y += 118;
}

function drawTocPages(pdf, layout, report, tocPageNumbers, cardPageMap) {
  const cards = report.tocCards;

  tocPageNumbers.forEach((pageNumber, pageIndex) => {
    pdf.setPage(pageNumber);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, 0, layout.width, layout.height, "F");

    let y = layout.top;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(37, 99, 235);
    pdf.text("SOMMAIRE", layout.left, y);
    y += 18;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Table des matières des cartes testées", layout.left, y);
    y += 26;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(88, 102, 122);
    const intro = pageIndex === 0
      ? `${report.detailScope.tocIntro} Chaque entrée renvoie vers la fiche correspondante dans le document.`
      : "Suite du sommaire des cartes testées.";
    const introLines = pdf.splitTextToSize(intro, layout.contentWidth);
    pdf.text(introLines, layout.left, y);
    y += introLines.length * 14 + 10;

    const rows = cards.slice(pageIndex * TOC_ROWS_PER_PAGE, (pageIndex + 1) * TOC_ROWS_PER_PAGE);
    if (!rows.length) {
      drawTocEmptyState(pdf, layout, y);
      return;
    }

    rows.forEach((card) => {
      const rowHeight = 28;
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(layout.left, y, layout.contentWidth, rowHeight, 12, 12, "FD");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(truncateText(card.title, 54), layout.left + 14, y + 17);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(truncateText(`${card.surfaceName} · ${card.pageName}`, 34), layout.left + 232, y + 17);

      const statusTone = getStatusTone(card.reportStatus.key);
      const badgeLabel = card.reportStatus.badgeLabel || card.reportStatus.label;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      const badgeWidth = Math.max(58, pdf.getTextWidth(badgeLabel.toUpperCase()) + 18);

      const targetPage = cardPageMap[card.id];
      const pageLabel = `p. ${targetPage || "-"}`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const pageTextWidth = pdf.getTextWidth(pageLabel);
      const badgeX = layout.right - 14 - pageTextWidth - 14 - badgeWidth;
      drawSmallBadge(pdf, badgeX, y + 5, badgeWidth, 18, badgeLabel, statusTone);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(37, 99, 235);
      pdf.text(pageLabel, layout.right - 14, y + 17, { align: "right" });

      if (targetPage) {
        pdf.link(layout.left, y, layout.contentWidth, rowHeight, { pageNumber: targetPage });
      }

      y += rowHeight + 8;
    });
  });
}

function drawTocEmptyState(pdf, layout, y) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(layout.left, y, layout.contentWidth, 84, 16, 16, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Aucune carte testée disponible", layout.left + 16, y + 26);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(88, 102, 122);
  const lines = pdf.splitTextToSize(
    "Le sommaire se remplira automatiquement dès qu'au moins une carte sera réellement rejouée ou documentée.",
    layout.contentWidth - 32,
  );
  pdf.text(lines, layout.left + 16, y + 46);
}

function drawSmallBadge(pdf, x, y, width, height, label, tone) {
  pdf.setFillColor(...tone.fill);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(x, y, width, height, 10, 10, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...tone.text);
  pdf.text(label.toUpperCase(), x + width / 2, y + 12, { align: "center" });
}

function decoratePdf(pdf, layout, report) {
  const totalPages = pdf.internal.getNumberOfPages();

  pdf.setProperties({
    title: report.brand.reportName,
    subject: "Rapport QA de fin de test",
    author: report.brand.companyName,
    creator: "QareData QA Board",
  });

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);

    if (pageNumber > 1) {
      pdf.setDrawColor(226, 232, 240);
      pdf.line(layout.left, 30, layout.right, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(report.brand.companyName.toUpperCase(), layout.left, 20);
      pdf.text(report.brand.projectName, layout.right, 20, { align: "right" });
    }

    pdf.setDrawColor(226, 232, 240);
    pdf.line(layout.left, layout.height - 26, layout.right, layout.height - 26);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `${report.brand.reportName} · ${report.brand.projectName}`,
      layout.left,
      layout.height - 12,
    );
    pdf.text(
      `Page ${pageNumber}/${totalPages} · ${formatReportDate(report.generatedAt)}`,
      layout.right,
      layout.height - 12,
      { align: "right" },
    );
  }
}

function getStatusTone(key) {
  switch (key) {
    case "validated":
      return {
        fill: [236, 253, 245],
        soft: [240, 253, 244],
        stroke: [110, 231, 183],
        text: [5, 150, 105],
      };
    case "partial":
      return {
        fill: [255, 247, 237],
        soft: [255, 251, 235],
        stroke: [251, 191, 36],
        text: [217, 119, 6],
      };
    case "failed":
      return {
        fill: [254, 242, 242],
        soft: [254, 242, 242],
        stroke: [248, 113, 113],
        text: [220, 38, 38],
      };
    default:
      return {
        fill: [241, 245, 249],
        soft: [248, 250, 252],
        stroke: [203, 213, 225],
        text: [100, 116, 139],
      };
  }
}

async function loadImageAsset(src) {
  if (!src) {
    throw new Error("Source image manquante");
  }

  if (IMAGE_CACHE.has(src)) {
    return IMAGE_CACHE.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const format = guessImageFormat(src);
        resolve({
          dataUrl: canvas.toDataURL(format === "PNG" ? "image/png" : "image/jpeg", 0.96),
          width: image.naturalWidth,
          height: image.naturalHeight,
          format,
        });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Impossible de charger l'image ${src}`));
    image.src = src;
  });

  IMAGE_CACHE.set(src, promise);
  return promise;
}

function guessImageFormat(src) {
  const value = String(src).toLowerCase();

  if (value.startsWith("data:image/png") || value.endsWith(".png")) {
    return "PNG";
  }

  if (value.startsWith("data:image/webp")) {
    return "JPEG";
  }

  return "JPEG";
}

function fitIntoBox(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: width * ratio,
    height: height * ratio,
  };
}
