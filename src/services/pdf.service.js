import { PDF_LIBRARY_SOURCES } from "../utils/constants.js";
import {
  cleanText,
  formatFileStamp,
  formatPercent,
  formatReportDate,
  truncateText,
} from "../utils/format.js";
import { buildReportModel } from "./report.service.js";
import { buildPrintablePdfDocument } from "./pdf.template.js";
import { normalizePdfText, sanitizeFilenameForPdf, truncateCaption, wrapPdfText, softenPdfText } from "./pdf-wrapping.js";

const PAGE_MARGIN_X = 46;
const PAGE_MARGIN_TOP = 54;
const PAGE_MARGIN_BOTTOM = 44;
const SECTION_GAP = 16;
const TOC_ROWS_PER_PAGE = 10;
const IMAGE_CACHE = new Map();
const FONT_BINARY_CACHE = new Map();

const PDF_THEME = {
  page: [243, 247, 252],
  surface: [255, 255, 255],
  surfaceMuted: [248, 250, 252],
  border: [223, 231, 243],
  borderSoft: [233, 239, 247],
  text: [15, 23, 42],
  textMuted: [88, 102, 122],
  textSoft: [100, 116, 139],
  primary: [37, 99, 235],
  primarySoft: [226, 232, 255],
  success: [22, 163, 74],
  successSoft: [236, 253, 245],
  warning: [217, 119, 6],
  warningSoft: [255, 247, 237],
  danger: [220, 38, 38],
  dangerSoft: [254, 242, 242],
  neutral: [71, 85, 105],
  neutralSoft: [241, 245, 249],
};

const PDF_FONT_SOURCES = [
  {
    family: "Quantify",
    style: "normal",
    fileName: "Quantify.ttf",
    url: new URL("../../assets/fonts/quantify/Quantify.ttf", import.meta.url).href,
  },
  {
    family: "Poppins",
    style: "normal",
    fileName: "Poppins-Regular.ttf",
    url: new URL("../../assets/fonts/poppins/Poppins-Regular.ttf", import.meta.url).href,
  },
  {
    family: "Poppins",
    style: "bold",
    fileName: "Poppins-Bold.ttf",
    url: new URL("../../assets/fonts/poppins/Poppins-Bold.ttf", import.meta.url).href,
  },
  {
    family: "PoppinsBlack",
    style: "normal",
    fileName: "Poppins-Black.ttf",
    url: new URL("../../assets/fonts/poppins/Poppins-Black.ttf", import.meta.url).href,
  },
];

// Wrapping helpers centralized in src/services/pdf-wrapping.js

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
  await ensurePdfFontsRegistered(pdf);
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

    iframe.addEventListener("load", async () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        cleanup();
        reject(new Error("Fenêtre d'impression indisponible."));
        return;
      }

      try {
        await waitForPrintableFrameReady(frameWindow);
        frameWindow.focus();
        frameWindow.print();
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, { once: true });

    iframe.srcdoc = buildPrintablePdfDocument(report, {
      baseHref: document.baseURI,
    });
    document.body.appendChild(iframe);
  });
}

async function waitForPrintableFrameReady(frameWindow) {
  const doc = frameWindow.document;
  const tasks = [];

  if (doc.fonts?.ready) {
    tasks.push(doc.fonts.ready.catch(() => null));
  }

  tasks.push(Promise.all(Array.from(doc.images || []).map(waitForImageReady)));
  tasks.push(waitForTwoAnimationFrames(frameWindow));

  await Promise.race([
    Promise.all(tasks),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);

  const overflow = detectHorizontalOverflow(doc);
  if (overflow.length) {
    console.warn("PDF imprimable: débordement horizontal détecté.", overflow.slice(0, 8));
  }
}

function waitForImageReady(image) {
  if (image.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

function waitForTwoAnimationFrames(frameWindow) {
  return new Promise((resolve) => {
    frameWindow.requestAnimationFrame(() => {
      frameWindow.requestAnimationFrame(() => resolve());
    });
  });
}

function detectHorizontalOverflow(doc) {
  const candidates = Array.from(
    doc.querySelectorAll(
      "[data-pdf-text], .toc-row, .detail-card__header, .detail-card, .bullet-list, .result-panel, .timeline-card, .image-card, .meta-item, .meta-strip__item, .mini-stat, .page-intro, .note-block",
    ),
  );

  return candidates.filter((element) => element.scrollWidth > element.clientWidth + 1);
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

async function ensurePdfFontsRegistered(pdf) {
  if (pdf.__qaredataFontsRegistered) {
    return true;
  }

  if (typeof pdf.addFileToVFS !== "function" || typeof pdf.addFont !== "function") {
    pdf.__qaredataFontsRegistered = false;
    return false;
  }

  try {
    for (const font of PDF_FONT_SOURCES) {
      const binary = await loadFontBinary(font.url);
      if (typeof pdf.existsFileInVFS !== "function" || !pdf.existsFileInVFS(font.fileName)) {
        pdf.addFileToVFS(font.fileName, binary);
      }
      pdf.addFont(font.fileName, font.family, font.style);
    }
    pdf.__qaredataFontsRegistered = true;
    return true;
  } catch (error) {
    console.warn("Chargement des polices PDF impossible, fallback Helvetica.", error);
    pdf.__qaredataFontsRegistered = false;
    return false;
  }
}

async function loadFontBinary(url) {
  if (FONT_BINARY_CACHE.has(url)) {
    return FONT_BINARY_CACHE.get(url);
  }

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Impossible de charger la police ${url}`);
      }
      return response.arrayBuffer();
    })
    .then(arrayBufferToBinaryString);

  FONT_BINARY_CACHE.set(url, promise);
  return promise;
}

function arrayBufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let result = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    result += String.fromCharCode(...chunk);
  }

  return result;
}

function reserveTocPages(pdf, tocCards) {
  // Reserve a single placeholder page for TOC; actual pagination will be computed while drawing
  pdf.addPage();
  return [pdf.internal.getNumberOfPages()];
}

function drawCoverPage(pdf, layout, report, logoAsset) {
  pdf.setPage(1);
  pdf.setFillColor(...PDF_THEME.page);
  pdf.rect(0, 0, layout.width, layout.height, "F");

  pdf.setFillColor(...PDF_THEME.primarySoft);
  pdf.circle(layout.width - 78, 108, 72, "F");
  pdf.setFillColor(231, 244, 238);
  pdf.circle(68, layout.height - 94, 58, "F");

  const heroX = layout.left;
  const heroY = 42;
  const heroHeight = 178;
  const heroPadding = 24;
  const logoBoxSize = 88;
  const logoX = layout.right - heroPadding - logoBoxSize;
  const heroTitleWidth = layout.contentWidth - logoBoxSize - 96;
  const reportTitleLines = wrapPdfText(pdf, report.brand.reportName, heroTitleWidth, { maxLines: 2 }).lines;

  drawPanel(pdf, heroX, heroY, layout.contentWidth, heroHeight, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 24,
  });
  drawAccentBar(pdf, heroX + 18, heroY + 20, 118, 28, PDF_THEME.primarySoft, PDF_THEME.primary);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...PDF_THEME.primary);
  pdf.text("QA DASHBOARD", heroX + 34, heroY + 38);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...PDF_THEME.textMuted);
  pdf.text(report.brand.companyName, heroX + heroPadding, heroY + 72);

  setPdfDisplayFont(pdf);
  pdf.setFontSize(30);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text(reportTitleLines, heroX + heroPadding, heroY + 108);

  const titleOffset = wrapPdfText(pdf, report.brand.reportName, heroTitleWidth, { maxLines: 2 }).computedHeight;
  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(...PDF_THEME.textMuted);
  pdf.text(report.brand.projectName, heroX + heroPadding, heroY + 112 + titleOffset);

  drawLogoPanel(pdf, logoX, heroY + 22, logoBoxSize, report, logoAsset);

  const metaY = heroY + heroHeight - 58;
  const metaGap = 10;
  const metaWidth = (layout.contentWidth - heroPadding * 2 - metaGap * 2) / 3;
  drawDashboardMetaCard(
    pdf,
    heroX + heroPadding,
    metaY,
    metaWidth,
    "Testeur",
    report.meta.tester || "Non renseigné",
  );
  drawDashboardMetaCard(
    pdf,
    heroX + heroPadding + metaWidth + metaGap,
    metaY,
    metaWidth,
    "Environnement",
    report.meta.environment || "Non renseigné",
  );
  drawDashboardMetaCard(
    pdf,
    heroX + heroPadding + (metaWidth + metaGap) * 2,
    metaY,
    metaWidth,
    "Généré le",
    formatReportDate(report.generatedAt),
  );

  const coveragePercent = report.reportStats.totalCards
    ? Math.round((report.reportStats.testedCount / report.reportStats.totalCards) * 100)
    : 0;
  const coverageLabel = formatPercent(report.reportStats.testedCount, report.reportStats.totalCards);
  const scoreY = heroY + heroHeight + 16;
  const scoreWidth = 214;
  const metricGap = 12;
  const metricsX = heroX + scoreWidth + metricGap;
  const metricsWidth = layout.contentWidth - scoreWidth - metricGap;
  const metricCardWidth = (metricsWidth - metricGap) / 2;
  const metricCardHeight = 76;

  drawDashboardScoreCard(pdf, heroX, scoreY, scoreWidth, 164, report, coveragePercent, coverageLabel);

  drawDashboardMetricCard(
    pdf,
    metricsX,
    scoreY,
    metricCardWidth,
    metricCardHeight,
    "Total cartes",
    String(report.reportStats.totalCards),
    {
      accent: PDF_THEME.primary,
      soft: PDF_THEME.primarySoft,
    },
  );
  drawDashboardMetricCard(
    pdf,
    metricsX + metricCardWidth + metricGap,
    scoreY,
    metricCardWidth,
    metricCardHeight,
    "Validées",
    String(report.reportStats.validatedCount),
    {
      accent: PDF_THEME.success,
      soft: PDF_THEME.successSoft,
    },
  );
  drawDashboardMetricCard(
    pdf,
    metricsX,
    scoreY + metricCardHeight + metricGap,
    metricCardWidth,
    metricCardHeight,
    "Échouées",
    String(report.reportStats.failedCount),
    {
      accent: PDF_THEME.danger,
      soft: PDF_THEME.dangerSoft,
    },
  );
  drawDashboardMetricCard(
    pdf,
    metricsX + metricCardWidth + metricGap,
    scoreY + metricCardHeight + metricGap,
    metricCardWidth,
    metricCardHeight,
    "En cours",
    String(report.reportStats.partialCount),
    {
      accent: PDF_THEME.warning,
      soft: PDF_THEME.warningSoft,
    },
  );

  const lowerY = scoreY + 180;
  const leftColumnWidth = 306;
  const rightColumnWidth = layout.contentWidth - leftColumnWidth - 14;
  const summaryItems = toSentenceList(report.summaryText, 5);
  const scopeItems = [
    report.detailScope.summary,
    report.detailScope.inclusionNote,
  ];
  const vigilanceItems = report.topProblems.length
    ? report.topProblems.slice(0, 3).map((card) => `${card.title} · ${card.reportStatus.label}`)
    : [
      `${report.metrics.blockersCount} point(s) bloquant(s) ouverts dans le périmètre.`,
      `${report.metrics.notesCount} carte(s) avec notes terrain et ${report.metrics.screenshotsCount} capture(s) déjà jointes.`,
    ];

  drawDashboardSummaryCard(
    pdf,
    heroX,
    lowerY,
    leftColumnWidth,
    248,
    "Résumé global",
    summaryItems,
    {
      accent: PDF_THEME.primary,
    },
  );
  drawDashboardSummaryCard(
    pdf,
    heroX + leftColumnWidth + 14,
    lowerY,
    rightColumnWidth,
    118,
    "Périmètre du détail",
    scopeItems,
    {
      accent: PDF_THEME.primary,
      compact: true,
    },
  );
  drawDashboardSummaryCard(
    pdf,
    heroX + leftColumnWidth + 14,
    lowerY + 130,
    rightColumnWidth,
    118,
    report.topProblems.length ? "Points de vigilance" : "Activité QA",
    vigilanceItems,
    {
      accent: report.topProblems.length ? PDF_THEME.danger : PDF_THEME.warning,
      compact: true,
    },
  );
}

function drawDashboardMetaCard(pdf, x, y, width, label, value) {
  drawPanel(pdf, x, y, width, 38, {
    fill: PDF_THEME.surfaceMuted,
    stroke: PDF_THEME.borderSoft,
    radius: 14,
  });
  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...PDF_THEME.textSoft);
  pdf.text(label.toUpperCase(), x + 12, y + 14);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...PDF_THEME.text);
  const wrapped = wrapPdfText(pdf, value, width - 24, { maxLines: 3, lineHeight: 12 });
  pdf.text(wrapped.lines, x + 12, y + 28);
}

function drawDashboardScoreCard(pdf, x, y, width, height, report, coveragePercent, coverageLabel) {
  drawPanel(pdf, x, y, width, height, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 24,
  });
  drawAccentBar(pdf, x + 18, y + 18, 106, 26, PDF_THEME.primarySoft, PDF_THEME.primary);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...PDF_THEME.primary);
  pdf.text("SCORE QA", x + 34, y + 35);

  setPdfBodyFont(pdf, "black");
  pdf.setFontSize(42);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text(`${report.reportStats.scorePercent}%`, x + 18, y + 86);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...PDF_THEME.textMuted);
  pdf.text(
    `Couverture ${coverageLabel} • ${report.reportStats.testedCount}/${report.reportStats.totalCards} cartes testées`,
    x + 18,
    y + 106,
  );

  drawProgressBar(pdf, x + 18, y + 118, width - 36, 10, report.reportStats.scorePercent, {
    fill: PDF_THEME.primary,
    soft: PDF_THEME.primarySoft,
  });

  drawMiniStat(pdf, x + 18, y + 142, (width - 42) / 2, "Notes", String(report.metrics.notesCount));
  drawMiniStat(
    pdf,
    x + 24 + (width - 42) / 2,
    y + 142,
    (width - 42) / 2,
    "Captures",
    String(report.metrics.screenshotsCount),
  );
}

function drawDashboardMetricCard(pdf, x, y, width, height, label, value, tone) {
  drawPanel(pdf, x, y, width, height, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 20,
  });
  drawAccentBar(pdf, x + 16, y + 16, 82, 24, tone.soft, tone.accent);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...tone.accent);
  pdf.text(label.toUpperCase(), x + 28, y + 32);

  setPdfBodyFont(pdf, "black");
  pdf.setFontSize(24);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text(String(value), x + 18, y + height - 18);
}

function drawDashboardSummaryCard(pdf, x, y, width, height, title, items, options = {}) {
  const accent = options.accent || PDF_THEME.primary;
  drawPanel(pdf, x, y, width, height, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 22,
  });
  drawAccentBar(pdf, x + 18, y + 16, options.compact ? 128 : 112, 24, PDF_THEME.surfaceMuted, accent);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...accent);
  pdf.text(title.toUpperCase(), x + 30, y + 32);

  drawBulletListInPanel(pdf, x + 18, y + 52, width - 36, height - 64, items, {
    bulletColor: accent,
    fontSize: options.compact ? 9.5 : 10.5,
    lineHeight: options.compact ? 12 : 14,
  });
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

  for (const [index, card] of report.detailCards.entries()) {
    if (index > 0 || state.y !== state.layout.top) {
      addFlowPage(state);
    }
    cardPageMap[card.id] = state.pageNumber;
    await drawCardSection(state, card);
  }

  return cardPageMap;
}

function createFlowState(pdf, layout) {
  paintFlowPageBackground(pdf, layout);
  return {
    pdf,
    layout,
    pageNumber: pdf.internal.getNumberOfPages(),
    y: layout.top,
  };
}

function addFlowPage(state) {
  state.pdf.addPage();
  paintFlowPageBackground(state.pdf, state.layout);
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
  const intro = `${report.detailScope.detailIntro} Chaque fiche rassemble le scénario utilisateur, les étapes réellement testées, les constats observés, les éventuels bugs, les notes et les captures présentes. ${report.detailScope.inclusionNote}`;
  const introWrap = wrapPdfText(pdf, intro, layout.contentWidth - 36, { maxLines: 4, lineHeight: 12 });
  const bannerHeight = 66 + introWrap.computedHeight;

  drawPanel(pdf, layout.left, state.y, layout.contentWidth, bannerHeight, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 24,
  });
  drawAccentBar(pdf, layout.left + 18, state.y + 18, 154, 26, PDF_THEME.primarySoft, PDF_THEME.primary);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...PDF_THEME.primary);
  pdf.text("DÉTAIL DES CARTES TESTÉES", layout.left + 32, state.y + 35);

  setPdfDisplayFont(pdf);
  pdf.setFontSize(24);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text("Rapport détaillé des vérifications QA", layout.left + 18, state.y + 66);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...PDF_THEME.textMuted);
  pdf.text(introWrap.lines, layout.left + 18, state.y + 90);

  state.y += bannerHeight + 14;

  const cardGap = 10;
  const statWidth = (layout.contentWidth - cardGap * 3) / 4;
  const stats = [
    ["Détaillées", String(report.detailScope.detailedCount), { accent: PDF_THEME.primary, soft: PDF_THEME.primarySoft }],
    ["En échec", String(report.reportStats.failedCount), { accent: PDF_THEME.danger, soft: PDF_THEME.dangerSoft }],
    ["En cours", String(report.reportStats.partialCount), { accent: PDF_THEME.warning, soft: PDF_THEME.warningSoft }],
    ["Captures", String(report.metrics.screenshotsCount), { accent: PDF_THEME.neutral, soft: PDF_THEME.neutralSoft }],
  ];

  stats.forEach(([label, value, tone], index) => {
    drawDashboardMetricCard(
      pdf,
      layout.left + index * (statWidth + cardGap),
      state.y,
      statWidth,
      72,
      label,
      value,
      tone,
    );
  });

  state.y += 84;
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

  state.y += 6;
}

function drawCardHeader(state, card) {
  const { pdf, layout } = state;
  const statusBadgeLabel = card.reportStatus.badgeLabel || card.reportStatus.label;
  const severityLabel = card.severity.badgeLabel || card.severity.label;

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9.5);
  const pillWidth = Math.min(162, Math.max(112, pdf.getTextWidth(statusBadgeLabel.toUpperCase()) + 30));
  const severityWidth = Math.min(152, Math.max(94, pdf.getTextWidth(severityLabel.toUpperCase()) + 28));
  const badgeColumnWidth = Math.max(pillWidth, severityWidth);
  const inlineTitleWidth = layout.contentWidth - badgeColumnWidth - 72;

  setPdfBodyFont(pdf, "black");
  pdf.setFontSize(17);
  let titleWrap = wrapPdfText(pdf, card.title, Math.max(220, inlineTitleWidth), { maxLines: 2 });
  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(10.5);
  let scenarioWrap = wrapPdfText(pdf, card.scenarioTitle, Math.max(220, inlineTitleWidth), { maxLines: 2 });

  const stackBadges = inlineTitleWidth < 280 || titleWrap.lines.length > 2 || scenarioWrap.lines.length > 2;
  const textWidth = stackBadges ? layout.contentWidth - 36 : Math.max(220, inlineTitleWidth);
  if (stackBadges) {
    setPdfBodyFont(pdf, "black");
    pdf.setFontSize(17);
    titleWrap = wrapPdfText(pdf, card.title, textWidth, { maxLines: 2 });
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(10.5);
    scenarioWrap = wrapPdfText(pdf, card.scenarioTitle, textWidth, { maxLines: 2 });
  }

  const badgeRowWidth = pillWidth + severityWidth + 8;
  const stackedBadgesHeight = stackBadges ? (badgeRowWidth <= textWidth ? 26 : 52) : 0;
  const introBottomOffset =
    56
    + titleWrap.computedHeight + 2
    + scenarioWrap.computedHeight + 2
    + stackedBadgesHeight;
  const metaOffset = Math.max(102, introBottomOffset + 10);
  const headerHeight = Math.max(170, metaOffset + 54);

  ensureSpace(state, headerHeight + SECTION_GAP);
  const metaY = state.y + metaOffset;

  const tone = getStatusTone(card.reportStatus.key);
  drawPanel(pdf, layout.left, state.y, layout.contentWidth, headerHeight, {
    fill: tone.soft,
    stroke: tone.stroke,
    radius: 22,
  });
  drawAccentBar(pdf, layout.left + 18, state.y + 16, 126, 24, tone.fill, tone.text);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...tone.text);
  pdf.text(softenPdfText(`${card.surfaceName} · ${card.pageName}`).toUpperCase(), layout.left + 32, state.y + 31);

  setPdfBodyFont(pdf, "black");
  pdf.setFontSize(17);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text(titleWrap.lines, layout.left + 18, state.y + 60);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...PDF_THEME.textMuted);
  const scenarioY = state.y + 68 + titleWrap.computedHeight + 2;
  pdf.text(scenarioWrap.lines, layout.left + 18, scenarioY);

  if (stackBadges) {
    const badgeY = scenarioY + scenarioWrap.computedHeight + 8;
    const statusX = layout.left + 18;
    drawStatusPill(pdf, statusX, badgeY, pillWidth, 26, statusBadgeLabel, tone);

    const severityX = badgeRowWidth <= textWidth ? statusX + pillWidth + 8 : statusX;
    const severityY = badgeRowWidth <= textWidth ? badgeY : badgeY + 30;
    drawOutlinePill(
      pdf,
      severityX,
      severityY,
      severityWidth,
      22,
      severityLabel,
      getSeverityTone(card.severity.tone),
    );
  } else {
    drawStatusPill(
      pdf,
      layout.right - badgeColumnWidth - 14,
      state.y + 16,
      badgeColumnWidth,
      26,
      statusBadgeLabel,
      tone,
    );

    drawOutlinePill(
      pdf,
      layout.right - badgeColumnWidth - 14,
      state.y + 50,
      badgeColumnWidth,
      22,
      severityLabel,
      getSeverityTone(card.severity.tone),
    );
  }

  const metaWidth = (layout.contentWidth - 18 * 2 - 8) / 2;
  drawInfoChip(pdf, layout.left + 18, metaY, metaWidth, "Statut QA", card.status.label);
  drawInfoChip(
    pdf,
    layout.left + 26 + metaWidth,
    metaY,
    metaWidth,
    "Progression",
    `${card.checklist.checked}/${card.checklist.total} · ${card.checklist.progressPercent}%`,
  );
  drawInfoChip(pdf, layout.left + 18, metaY + 28, metaWidth, "Testeur", card.tester || "Non renseigné");
  drawInfoChip(
    pdf,
    layout.left + 26 + metaWidth,
    metaY + 28,
    metaWidth,
    "Environnement",
    card.environment || "Non renseigné",
  );

  state.y += headerHeight + SECTION_GAP;
}

function drawStatusPill(pdf, x, y, width, height, label, tone) {
  pdf.setFillColor(...tone.fill);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(x, y, width, height, 13, 13, "FD");

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...tone.text);
  pdf.text(label.toUpperCase(), x + width / 2, y + 17, { align: "center" });
}

function drawSectionLabel(state, label) {
  ensureSpace(state, 22);
  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(9.5);
  state.pdf.setTextColor(...PDF_THEME.primary);
  state.pdf.text(label.toUpperCase(), state.layout.left, state.y);
  state.y += 16;
}

function drawParagraphSection(state, title, text) {
  if (!cleanText(text)) {
    return;
  }

  const bodyWidth = state.layout.contentWidth - 34;
  const wrapped = wrapPdfText(state.pdf, text, bodyWidth);
  const panelHeight = 50 + wrapped.computedHeight;
  const accent = title === "Notes"
    ? PDF_THEME.warning
    : title === "Résultat attendu"
      ? PDF_THEME.success
      : PDF_THEME.primary;
  const softFill = title === "Notes"
    ? PDF_THEME.warningSoft
    : title === "Résultat attendu"
      ? PDF_THEME.successSoft
      : PDF_THEME.surface;

  ensureSpace(state, panelHeight + 6, { continuedTitle: title });
  drawPanel(state.pdf, state.layout.left, state.y, state.layout.contentWidth, panelHeight, {
    fill: softFill,
    stroke: PDF_THEME.border,
    radius: 18,
  });
  drawAccentBar(state.pdf, state.layout.left + 16, state.y + 14, 118, 22, PDF_THEME.surfaceMuted, accent);

  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(8.5);
  state.pdf.setTextColor(...accent);
  state.pdf.text(title.toUpperCase(), state.layout.left + 28, state.y + 29);

  setPdfBodyFont(state.pdf, "normal");
  state.pdf.setFontSize(10.5);
  state.pdf.setTextColor(...PDF_THEME.neutral);
  state.pdf.text(wrapped.lines, state.layout.left + 16, state.y + 50);

  state.y += panelHeight + 10;
}

function drawScenarioSection(state, card) {
  if (!card.scenarioSteps.length) {
    return;
  }

  drawSectionLabel(state, "Scénario utilisateur");
  drawSubsectionTitle(state, card.scenarioTitle);

  for (const [index, item] of card.scenarioSteps.entries()) {
    const toneKey = item.status === "ok" ? "validated" : item.status === "ko" ? "failed" : "untested";
    const stepTone = getStatusTone(toneKey);
    setPdfBodyFont(state.pdf, "bold");
    state.pdf.setFontSize(8.5);
    const badgeWidth = Math.min(
      122,
      Math.max(88, state.pdf.getTextWidth((item.statusBadgeLabel || item.statusLabel).toUpperCase()) + 22),
    );
    let contentWidth = state.layout.contentWidth - badgeWidth - 86;
    setPdfBodyFont(state.pdf, "bold");
    state.pdf.setFontSize(11);
    let titleWrap = wrapPdfText(state.pdf, item.label, Math.max(220, contentWidth), { maxLines: 2 });
    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(9.5);
    let metaWrap = wrapPdfText(
      state.pdf,
      item.testStamp || "Étape non testée pour le moment.",
      Math.max(220, contentWidth),
    );
    let bugWraps = item.status === "ko"
      ? [
          wrapPdfText(state.pdf, `Bug : ${item.bug?.description}`, Math.max(220, contentWidth)),
          wrapPdfText(state.pdf, `Observé : ${item.bug?.observedBehavior}`, Math.max(220, contentWidth)),
          wrapPdfText(state.pdf, `Attendu : ${item.bug?.expectedResult}`, Math.max(220, contentWidth)),
        ]
      : [];
    const stackBadge = contentWidth < 280 || titleWrap.lines.length > 2 || metaWrap.lines.length > 3 || bugWraps.length > 7;

    if (stackBadge) {
      contentWidth = state.layout.contentWidth - 60;
      setPdfBodyFont(state.pdf, "bold");
      state.pdf.setFontSize(11);
      titleWrap = wrapPdfText(state.pdf, item.label, contentWidth, { maxLines: 2 });
      setPdfBodyFont(state.pdf, "normal");
      state.pdf.setFontSize(9.5);
      metaWrap = wrapPdfText(
        state.pdf,
        item.testStamp || "Étape non testée pour le moment.",
        contentWidth,
      );
      bugWraps = item.status === "ko"
        ? [
            wrapPdfText(state.pdf, `Bug : ${item.bug?.description}`, contentWidth),
            wrapPdfText(state.pdf, `Observé : ${item.bug?.observedBehavior}`, contentWidth),
            wrapPdfText(state.pdf, `Attendu : ${item.bug?.expectedResult}`, contentWidth),
          ]
        : [];
    }

    const badgeBlockHeight = stackBadge ? 26 + 8 : 0;
    const itemHeight = Math.max(
      74,
      28
        + titleWrap.computedHeight
        + metaWrap.computedHeight
        + badgeBlockHeight
        + (bugWraps.length ? bugWraps.reduce((sum, wrap) => sum + wrap.computedHeight, 0) + 28 : 0),
    );

    if (ensureSpace(state, itemHeight + 8, { continuedTitle: "Scénario utilisateur" })) {
      drawSubsectionTitle(state, `${card.scenarioTitle} (suite)`);
    }

    drawPanel(state.pdf, state.layout.left, state.y, state.layout.contentWidth, itemHeight, {
      fill: stepTone.soft,
      stroke: stepTone.stroke,
      radius: 18,
    });

    state.pdf.setFillColor(...PDF_THEME.surface);
    state.pdf.setDrawColor(...stepTone.stroke);
    state.pdf.circle(state.layout.left + 24, state.y + 28, 12, "FD");
    setPdfBodyFont(state.pdf, "bold");
    state.pdf.setFontSize(10);
    state.pdf.setTextColor(...stepTone.text);
    state.pdf.text(String(index + 1), state.layout.left + 24, state.y + 32, { align: "center" });

    let cursorY = state.y + 24;
    setPdfBodyFont(state.pdf, "bold");
    state.pdf.setFontSize(11);
    state.pdf.setTextColor(...PDF_THEME.text);
    state.pdf.text(titleWrap.lines, state.layout.left + 48, cursorY);
    cursorY += titleWrap.computedHeight + 6;

    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(9.5);
    state.pdf.setTextColor(...PDF_THEME.textSoft);
    state.pdf.text(metaWrap.lines, state.layout.left + 48, cursorY);
    cursorY += metaWrap.computedHeight + 4;

    if (stackBadge) {
      drawSmallBadge(
        state.pdf,
        state.layout.left + 48,
        cursorY,
        badgeWidth,
        20,
        item.statusBadgeLabel || item.statusLabel,
        stepTone,
      );
      cursorY += 28;
    }

    if (bugWraps.length) {
      const bugTextHeight = bugWraps.reduce((sum, wrap) => sum + wrap.computedHeight, 0);
      drawPanel(
        state.pdf,
        state.layout.left + 48,
        cursorY,
        state.layout.contentWidth - 64,
        bugTextHeight + 18,
        {
          fill: PDF_THEME.dangerSoft,
          stroke: stepTone.stroke,
          radius: 14,
        },
      );
      setPdfBodyFont(state.pdf, "normal");
      state.pdf.setFontSize(9.5);
      state.pdf.setTextColor(...PDF_THEME.danger);
      let bugCursorY = cursorY + 14;
      bugWraps.forEach((wrap) => {
        state.pdf.text(wrap.lines, state.layout.left + 58, bugCursorY);
        bugCursorY += wrap.computedHeight + 4;
      });
    }

    if (!stackBadge) {
      drawSmallBadge(
        state.pdf,
        state.layout.right - badgeWidth - 12,
        state.y + 18,
        badgeWidth,
        20,
        item.statusBadgeLabel || item.statusLabel,
        stepTone,
      );
    }

    state.y += itemHeight + 8;
  }

  state.y += 4;
}

function drawObservedSection(state, card) {
  drawSectionLabel(state, "Résultats");

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

  const compactGrid = canRenderResultGrid(state.pdf, state.layout.contentWidth, workingItems, problemItems);
  if (compactGrid) {
    drawResultGrid(state, workingItems, problemItems);
  } else {
    drawBulletSection(state, "Ce qui fonctionne", workingItems, {
      continuedTitle: "Résultats",
      bulletColor: PDF_THEME.success,
      fillColor: PDF_THEME.successSoft,
    });
    drawBulletSection(state, "Problèmes détectés", problemItems, {
      continuedTitle: "Résultats",
      bulletColor: PDF_THEME.danger,
      fillColor: PDF_THEME.dangerSoft,
    });
  }

  if (card.recommendations.length) {
    drawBulletSection(state, "Recommandations", card.recommendations, {
      continuedTitle: "Résultats",
      bulletColor: PDF_THEME.primary,
      fillColor: PDF_THEME.primarySoft,
    });
  }
}

function drawBulletSection(state, title, items, options = {}) {
  if (!items.length) {
    return;
  }

  const bulletColor = options.bulletColor || PDF_THEME.primary;
  const fillColor = options.fillColor || PDF_THEME.surface;
  const panelHeight = measureBulletSectionHeight(state.pdf, items, state.layout.contentWidth - 34);

  ensureSpace(state, panelHeight + 10, { continuedTitle: options.continuedTitle || title });
  drawPanel(state.pdf, state.layout.left, state.y, state.layout.contentWidth, panelHeight, {
    fill: fillColor,
    stroke: PDF_THEME.border,
    radius: 18,
  });
  drawAccentBar(state.pdf, state.layout.left + 16, state.y + 14, 126, 22, PDF_THEME.surfaceMuted, bulletColor);

  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(8.5);
  state.pdf.setTextColor(...bulletColor);
  state.pdf.text(title.toUpperCase(), state.layout.left + 28, state.y + 29);

  let cursorY = state.y + 52;
  const textX = state.layout.left + 28;
  items.forEach((item) => {
    const wrapped = wrapPdfText(state.pdf, item, state.layout.contentWidth - 46, { maxLines: 4, lineHeight: 11 });
    state.pdf.setFillColor(...bulletColor);
    state.pdf.circle(state.layout.left + 16, cursorY + 4, 2.4, "F");
    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(10);
    state.pdf.setTextColor(...PDF_THEME.neutral);
    state.pdf.text(wrapped.lines, textX, cursorY + 8);
    cursorY += wrapped.computedHeight + 5;
  });

  state.y += panelHeight + 10;
}

function drawSubsectionTitle(state, title) {
  const wrapped = wrapPdfText(state.pdf, title, state.layout.contentWidth, { maxLines: 2 });
  ensureSpace(state, Math.max(18, wrapped.computedHeight + 6));
  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(9.5);
  state.pdf.setTextColor(...PDF_THEME.textSoft);
  state.pdf.text(wrapped.lines, state.layout.left, state.y);
  state.y += wrapped.computedHeight + 2;
}

async function drawScreenshotsSection(state, card) {
  drawSectionLabel(state, "Images");

  const gutter = 10;
  const imageWidth = (state.layout.contentWidth - gutter) / 2;
  const maxImageHeight = 130;
  let x = state.layout.left;
  let rowHeight = 0;
  let columnIndex = 0;

  for (const shot of card.screenshots) {
    const asset = await loadImageAsset(shot.dataUrl).catch(() => null);
    if (!asset) {
      continue;
    }

    const fitted = fitIntoBox(asset.width, asset.height, imageWidth, maxImageHeight);
    const caption = truncateCaption(shot.name || "Capture", 56);
    const captionWrap = wrapPdfText(state.pdf, caption, imageWidth - 16, { maxLines: 2, lineHeight: 10 });
    const captionHeight = Math.max(18, captionWrap.computedHeight + 4);
    const blockHeight = fitted.height + captionHeight + 16;

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

    drawPanel(state.pdf, x, state.y, imageWidth, blockHeight, {
      fill: PDF_THEME.surface,
      stroke: PDF_THEME.border,
      radius: 16,
    });
    state.pdf.setFillColor(...PDF_THEME.surfaceMuted);
    state.pdf.roundedRect(x + 8, state.y + 8, imageWidth - 16, fitted.height + 4, 12, 12, "F");
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

    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(9);
    state.pdf.setTextColor(...PDF_THEME.textSoft);
    state.pdf.text(captionWrap.lines, x + imageWidth / 2, state.y + blockHeight - captionWrap.computedHeight, {
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
  const linesCollection = paragraphs
    .map((paragraph) => wrapPdfText(state.pdf, paragraph, state.layout.contentWidth - 34, { maxLines: 8, lineHeight: 12 }))
    .filter((wrap) => wrap.lines.length);
  const bodyHeight = linesCollection.reduce((total, wrap) => total + wrap.computedHeight + 6, 0);
  const boxHeight = Math.max(112, 44 + bodyHeight);

  ensureSpace(state, boxHeight + 10);
  drawPanel(state.pdf, state.layout.left, state.y, state.layout.contentWidth, boxHeight, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 20,
  });
  drawAccentBar(state.pdf, state.layout.left + 18, state.y + 16, 154, 26, PDF_THEME.warningSoft, PDF_THEME.warning);

  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(9);
  state.pdf.setTextColor(...PDF_THEME.warning);
  state.pdf.text("ÉTAT ACTUEL", state.layout.left + 34, state.y + 34);

  setPdfDisplayFont(state.pdf);
  state.pdf.setFontSize(16);
  state.pdf.setTextColor(...PDF_THEME.text);
  state.pdf.text(title, state.layout.left + 18, state.y + 62);

  setPdfBodyFont(state.pdf, "normal");
  state.pdf.setFontSize(10);
  state.pdf.setTextColor(...PDF_THEME.neutral);
  let y = state.y + 84;
  linesCollection.forEach((wrap) => {
    state.pdf.text(wrap.lines, state.layout.left + 18, y);
    y += wrap.computedHeight + 6;
  });

  state.y += boxHeight + 10;
}

function drawTocPages(pdf, layout, report, tocPageNumbers, cardPageMap) {
  const cards = report.tocCards;
  if (!cards.length) {
    // draw a single empty toc page
    const [firstPage] = tocPageNumbers;
    pdf.setPage(firstPage);
    pdf.setFillColor(...PDF_THEME.page);
    pdf.rect(0, 0, layout.width, layout.height, "F");
    drawTocEmptyState(pdf, layout, layout.top + 12);
    return;
  }

  let currentPage = tocPageNumbers[0];
  pdf.setPage(currentPage);

  let y = layout.top;
  let cardIndex = 0;
  let pageCounter = 0;

  const renderTocHeader = (isFirst = false) => {
    pdf.setFillColor(...PDF_THEME.page);
    pdf.rect(0, 0, layout.width, layout.height, "F");
    const intro = isFirst
      ? `${report.detailScope.tocIntro} Chaque entrée renvoie vers la fiche correspondante dans le document.`
      : "Suite du sommaire des cartes testées.";
    const introWrap = wrapPdfText(pdf, intro, layout.contentWidth - 36, { maxLines: 4, lineHeight: 12 });
    const headerHeight = 64 + introWrap.computedHeight;

    drawPanel(pdf, layout.left, y, layout.contentWidth, headerHeight, {
      fill: PDF_THEME.surface,
      stroke: PDF_THEME.border,
      radius: 24,
    });
    drawAccentBar(pdf, layout.left + 18, y + 18, 96, 24, PDF_THEME.primarySoft, PDF_THEME.primary);

    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...PDF_THEME.primary);
    pdf.text("SOMMAIRE", layout.left + 34, y + 34);

    setPdfDisplayFont(pdf);
    pdf.setFontSize(24);
    pdf.setTextColor(...PDF_THEME.text);
    pdf.text("Table des matières des cartes testées", layout.left + 18, y + 64);

    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(...PDF_THEME.textMuted);
    pdf.text(introWrap.lines, layout.left + 18, y + 88);
    y += headerHeight + 14;

    const statWidth = (layout.contentWidth - 20) / 3;
    drawDashboardMetaCard(pdf, layout.left, y, statWidth, "Cartes détaillées", `${report.detailScope.detailedCount} / ${report.detailScope.totalCount}`);
    drawDashboardMetaCard(pdf, layout.left + statWidth + 10, y, statWidth, "Échecs", String(report.reportStats.failedCount));
    drawDashboardMetaCard(pdf, layout.left + (statWidth + 10) * 2, y, statWidth, "En cours", String(report.reportStats.partialCount));
    y += 54;
    pageCounter += 1;
  };

  // start first header
  renderTocHeader(true);

  while (cardIndex < cards.length) {
    const card = cards[cardIndex];
    const titleWrap = wrapPdfText(pdf, card.title, layout.contentWidth - 202, { maxLines: 2, lineHeight: 10 });
    const subtitleWrap = wrapPdfText(pdf, `${card.surfaceName} · ${card.pageName}`, layout.contentWidth - 202, { maxLines: 1, lineHeight: 9 });
    const rowHeight = Math.max(44, 18 + titleWrap.computedHeight + subtitleWrap.computedHeight);

    if (y + rowHeight > layout.bottom) {
      // new page
      pdf.addPage();
      currentPage = pdf.internal.getNumberOfPages();
      pdf.setPage(currentPage);
      y = layout.top;
      renderTocHeader(false);
    }

    drawPanel(pdf, layout.left, y, layout.contentWidth, rowHeight, { fill: PDF_THEME.surface, stroke: PDF_THEME.border, radius: 16 });
    pdf.setFillColor(...PDF_THEME.primarySoft);
    pdf.circle(layout.left + 20, y + 21, 10, "F");
    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...PDF_THEME.primary);
    pdf.text(String(cardIndex + 1).padStart(2, "0"), layout.left + 20, y + 24, { align: "center" });

    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...PDF_THEME.text);
    pdf.text(titleWrap.lines, layout.left + 40, y + 18);

    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...PDF_THEME.textSoft);
    pdf.text(subtitleWrap.lines, layout.left + 40, y + 18 + titleWrap.computedHeight + 2);

    const statusTone = getStatusTone(card.reportStatus.key);
    const badgeLabel = card.reportStatus.badgeLabel || card.reportStatus.label;
    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(8.5);
    const badgeWidth = Math.max(66, pdf.getTextWidth(badgeLabel.toUpperCase()) + 18);
    const severityLabel = card.severity.badgeLabel || card.severity.label;
    const severityWidth = Math.max(62, pdf.getTextWidth(severityLabel.toUpperCase()) + 18);

    const targetPage = cardPageMap[card.id];
    const pageLabel = `p. ${targetPage || "-"}`;
    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(9.5);
    const pageTextWidth = pdf.getTextWidth(pageLabel);
    const statusX = layout.right - 14 - pageTextWidth - 12 - badgeWidth;
    const severityX = statusX - 8 - severityWidth;
    drawOutlinePill(pdf, severityX, y + 10, severityWidth, 18, severityLabel, getSeverityTone(card.severity.tone));
    drawSmallBadge(pdf, statusX, y + 10, badgeWidth, 18, badgeLabel, statusTone);

    setPdfBodyFont(pdf, "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...PDF_THEME.primary);
    pdf.text(pageLabel, layout.right - 14, y + 24, { align: "right" });

    if (targetPage) {
      pdf.link(layout.left, y, layout.contentWidth, rowHeight, { pageNumber: targetPage });
    }

    y += rowHeight + 8;
    cardIndex += 1;
  }
}

function drawTocEmptyState(pdf, layout, y) {
  drawPanel(pdf, layout.left, y, layout.contentWidth, 148, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.border,
    radius: 20,
  });
  drawAccentBar(pdf, layout.left + 18, y + 18, 158, 26, PDF_THEME.warningSoft, PDF_THEME.warning);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...PDF_THEME.warning);
  pdf.text("AUCUNE ENTRÉE DÉTAILLÉE", layout.left + 34, y + 35);

  setPdfDisplayFont(pdf);
  pdf.setFontSize(16);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text("Le sommaire se remplira dès qu'une carte sera testée.", layout.left + 18, y + 64);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...PDF_THEME.textMuted);
  const wrapped = wrapPdfText(pdf,
    "Une carte entre dans le détail dès qu'au moins une étape a été jouée, ou si des notes, captures ou un statut QA hors « À lancer » sont déjà présents.",
    layout.contentWidth - 36,
  );
  pdf.text(wrapped.lines, layout.left + 18, y + 88);
}

function drawSmallBadge(pdf, x, y, width, height, label, tone) {
  pdf.setFillColor(...tone.fill);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(x, y, width, height, 10, 10, "FD");

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...tone.text);
  pdf.text(label.toUpperCase(), x + width / 2, y + height / 2 + 3, { align: "center" });
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
      pdf.setDrawColor(...PDF_THEME.border);
      pdf.line(layout.left, 30, layout.right, 30);
      setPdfBodyFont(pdf, "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...PDF_THEME.textSoft);
      pdf.text(report.brand.companyName.toUpperCase(), layout.left, 20);
      pdf.text(report.brand.projectName, layout.right, 20, { align: "right" });
    }

    pdf.setDrawColor(...PDF_THEME.border);
    pdf.line(layout.left, layout.height - 26, layout.right, layout.height - 26);
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...PDF_THEME.textSoft);
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

function drawPanel(pdf, x, y, width, height, options = {}) {
  const fill = options.fill || PDF_THEME.surface;
  const stroke = options.stroke || PDF_THEME.border;
  const radius = options.radius || 18;
  pdf.setFillColor(...fill);
  pdf.setDrawColor(...stroke);
  pdf.roundedRect(x, y, width, height, radius, radius, "FD");
}

function setPdfDisplayFont(pdf) {
  if (pdf.__qaredataFontsRegistered) {
    pdf.setFont("Quantify", "normal");
    return;
  }
  pdf.setFont("helvetica", "bold");
}

function setPdfBodyFont(pdf, weight = "normal") {
  if (pdf.__qaredataFontsRegistered) {
    if (weight === "black") {
      pdf.setFont("PoppinsBlack", "normal");
      return;
    }
    pdf.setFont("Poppins", weight === "bold" ? "bold" : "normal");
    return;
  }

  pdf.setFont("helvetica", weight === "normal" ? "normal" : "bold");
}

function paintFlowPageBackground(pdf, layout) {
  pdf.setFillColor(...PDF_THEME.page);
  pdf.rect(0, 0, layout.width, layout.height, "F");
}

function drawAccentBar(pdf, x, y, width, height, fill, stroke) {
  pdf.setFillColor(...fill);
  pdf.setDrawColor(...stroke);
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, "FD");
}

function drawLogoPanel(pdf, x, y, size, report, logoAsset) {
  drawPanel(pdf, x, y, size, size, {
    fill: PDF_THEME.surfaceMuted,
    stroke: PDF_THEME.border,
    radius: 22,
  });

  if (logoAsset) {
    const logoSize = fitIntoBox(logoAsset.width, logoAsset.height, size - 22, size - 22);
    pdf.addImage(
      logoAsset.dataUrl,
      logoAsset.format,
      x + (size - logoSize.width) / 2,
      y + (size - logoSize.height) / 2,
      logoSize.width,
      logoSize.height,
      undefined,
      "FAST",
    );
    return;
  }

  setPdfDisplayFont(pdf);
  pdf.setFontSize(26);
  pdf.setTextColor(...PDF_THEME.primary);
  pdf.text(report.brand.logoFallback || "QA", x + size / 2, y + size / 2 + 8, { align: "center" });
}

function drawProgressBar(pdf, x, y, width, height, value, tone) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  pdf.setFillColor(...tone.soft);
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  pdf.setFillColor(...tone.fill);
  pdf.roundedRect(x, y, width * (clamped / 100), height, height / 2, height / 2, "F");
}

function drawMiniStat(pdf, x, y, width, label, value) {
  drawPanel(pdf, x, y, width, 18, {
    fill: PDF_THEME.surfaceMuted,
    stroke: PDF_THEME.borderSoft,
    radius: 10,
  });
  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...PDF_THEME.textSoft);
  pdf.text(label.toUpperCase(), x + 8, y + 12);
  pdf.text(value, x + width - 8, y + 12, { align: "right" });
}

function drawInfoChip(pdf, x, y, width, label, value) {
  drawPanel(pdf, x, y, width, 22, {
    fill: PDF_THEME.surface,
    stroke: PDF_THEME.borderSoft,
    radius: 10,
  });
  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...PDF_THEME.textSoft);
  pdf.text(label.toUpperCase(), x + 8, y + 8);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...PDF_THEME.text);
  const wrapped = wrapPdfText(pdf, value, width - 16, { maxLines: 2, lineHeight: 9 });
  pdf.text(wrapped.lines, x + 8, y + 17);
}

function drawOutlinePill(pdf, x, y, width, height, label, tone) {
  pdf.setFillColor(...tone.fill);
  pdf.setDrawColor(...tone.stroke);
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, "FD");

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...tone.text);
  pdf.text(label.toUpperCase(), x + width / 2, y + height / 2 + 3, { align: "center" });
}

function drawBulletListInPanel(pdf, x, y, width, height, items, options = {}) {
  const bulletColor = options.bulletColor || PDF_THEME.primary;
  const fontSize = options.fontSize || 10.5;
  const lineHeight = options.lineHeight || 14;
  let cursorY = y;
  const limitY = y + height - 8;

  items.forEach((item) => {
    if (cursorY > limitY) {
      return;
    }

    const wrapped = wrapPdfText(pdf, item, width - 14, { maxLines: 4, lineHeight });
    const blockHeight = wrapped.computedHeight;
    if (cursorY + blockHeight > limitY) {
      return;
    }

    pdf.setFillColor(...bulletColor);
    pdf.circle(x + 3, cursorY + 4, 2.4, "F");
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...PDF_THEME.neutral);
    pdf.text(wrapped.lines, x + 12, cursorY + 8);
    cursorY += blockHeight + 6;
  });
}

function toSentenceList(text, maxItems = 5) {
  return (String(text || "").match(/[^.!?]+[.!?]?/g) || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function measureBulletSectionHeight(pdf, items, width) {
  return items.reduce((total, item) => {
    const wrapped = wrapPdfText(pdf, item, width - 12, { maxLines: 4, lineHeight: 11 });
    return total + wrapped.computedHeight + 4;
  }, 40);
}

function canRenderResultGrid(pdf, contentWidth, leftItems, rightItems) {
  const width = (contentWidth - 12) / 2;
  const leftHeight = measureBulletSectionHeight(pdf, leftItems, width - 22);
  const rightHeight = measureBulletSectionHeight(pdf, rightItems, width - 22);
  return Math.max(leftHeight, rightHeight) <= 168;
}

function drawResultGrid(state, workingItems, problemItems) {
  const gap = 12;
  const columnWidth = (state.layout.contentWidth - gap) / 2;
  const leftHeight = measureBulletSectionHeight(state.pdf, workingItems, columnWidth - 22);
  const rightHeight = measureBulletSectionHeight(state.pdf, problemItems, columnWidth - 22);
  const boxHeight = Math.max(leftHeight, rightHeight);

  ensureSpace(state, boxHeight + 10, { continuedTitle: "Résultats" });
  drawResultColumn(
    state.pdf,
    state.layout.left,
    state.y,
    columnWidth,
    boxHeight,
    "Ce qui fonctionne",
    workingItems,
    {
      accent: PDF_THEME.success,
      soft: PDF_THEME.successSoft,
    },
  );
  drawResultColumn(
    state.pdf,
    state.layout.left + columnWidth + gap,
    state.y,
    columnWidth,
    boxHeight,
    "Problèmes détectés",
    problemItems,
    {
      accent: PDF_THEME.danger,
      soft: PDF_THEME.dangerSoft,
    },
  );
  state.y += boxHeight + 10;
}

function drawResultColumn(pdf, x, y, width, height, title, items, tone) {
  drawPanel(pdf, x, y, width, height, {
    fill: tone.soft,
    stroke: PDF_THEME.border,
    radius: 18,
  });
  drawAccentBar(pdf, x + 14, y + 14, 122, 22, PDF_THEME.surface, tone.accent);

  setPdfBodyFont(pdf, "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...tone.accent);
  pdf.text(title.toUpperCase(), x + 26, y + 29);

  let cursorY = y + 48;
  items.forEach((item) => {
    const wrapped = wrapPdfText(pdf, item, width - 28, { maxLines: 4, lineHeight: 11 });
    pdf.setFillColor(...tone.accent);
    pdf.circle(x + 14, cursorY + 4, 2.4, "F");
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...PDF_THEME.neutral);
    pdf.text(wrapped.lines, x + 24, cursorY + 8);
    cursorY += wrapped.computedHeight + 5;
  });
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

function getSeverityTone(key) {
  switch (key) {
    case "blocker":
      return {
        fill: PDF_THEME.dangerSoft,
        stroke: [252, 165, 165],
        text: PDF_THEME.danger,
      };
    case "minor":
      return {
        fill: [238, 242, 255],
        stroke: [165, 180, 252],
        text: [79, 70, 229],
      };
    default:
      return {
        fill: PDF_THEME.warningSoft,
        stroke: [253, 186, 116],
        text: PDF_THEME.warning,
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
