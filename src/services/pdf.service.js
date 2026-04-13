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

const PAGE_MARGIN_X = 46;
const PAGE_MARGIN_TOP = 54;
const PAGE_MARGIN_BOTTOM = 44;
const SECTION_GAP = 16;
const TOC_ROWS_PER_PAGE = 12;
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
  const reportTitleLines = pdf.splitTextToSize(report.brand.reportName, heroTitleWidth);

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

  const titleOffset = reportTitleLines.length * 28;
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
  const lines = pdf.splitTextToSize(cleanText(value), width - 24).slice(0, 2);
  pdf.text(lines, x + 12, y + 28);
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

  setPdfDisplayFont(pdf);
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

  for (const card of report.detailCards) {
    ensureSpace(state, 110);
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
  const introLines = pdf.splitTextToSize(intro, layout.contentWidth - 36);
  const bannerHeight = 74 + introLines.length * 14;

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
  pdf.text(introLines, layout.left + 18, state.y + 90);

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

  state.pdf.setDrawColor(226, 232, 240);
  state.pdf.line(state.layout.left, state.y, state.layout.right, state.y);
  state.y += 20;
}

function drawCardHeader(state, card) {
  const { pdf, layout } = state;
  const statusBadgeLabel = card.reportStatus.badgeLabel || card.reportStatus.label;
  const pillWidth = Math.max(112, pdf.getTextWidth(statusBadgeLabel.toUpperCase()) + 26);
  const severityLabel = card.severity.badgeLabel || card.severity.label;
  const severityWidth = Math.max(94, pdf.getTextWidth(severityLabel.toUpperCase()) + 24);
  const badgeColumnWidth = Math.max(pillWidth, severityWidth);
  const titleMaxWidth = layout.contentWidth - badgeColumnWidth - 52;
  const titleLines = pdf.splitTextToSize(card.title, titleMaxWidth);
  const scenarioLines = pdf.splitTextToSize(card.scenarioTitle, titleMaxWidth);
  const headerHeight = Math.max(
    164,
    100 + titleLines.length * 18 + scenarioLines.length * 12,
  );

  ensureSpace(state, headerHeight + SECTION_GAP);

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
  pdf.text(`${cleanText(card.surfaceName)} · ${cleanText(card.pageName)}`.toUpperCase(), layout.left + 32, state.y + 31);

  setPdfDisplayFont(pdf);
  pdf.setFontSize(19);
  pdf.setTextColor(...PDF_THEME.text);
  pdf.text(titleLines, layout.left + 18, state.y + 60);

  setPdfBodyFont(pdf, "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...PDF_THEME.textMuted);
  pdf.text(scenarioLines, layout.left + 18, state.y + 68 + titleLines.length * 18);

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

  const metaWidth = (layout.contentWidth - 18 * 2 - 8) / 2;
  const metaY = state.y + headerHeight - 62;
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
  const lines = state.pdf.splitTextToSize(cleanText(text), bodyWidth);
  const panelHeight = 48 + lines.length * 14;
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
  state.pdf.text(lines, state.layout.left + 16, state.y + 50);

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
    const badgeWidth = 88;
    const contentWidth = state.layout.contentWidth - badgeWidth - 86;
    const titleLines = state.pdf.splitTextToSize(cleanText(item.label), contentWidth);
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
      74,
      28
        + titleLines.length * 14
        + metaLines.length * 12
        + (bugBlocks.length ? bugBlocks.length * 12 + 28 : 0),
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
    state.pdf.text(titleLines, state.layout.left + 48, cursorY);
    cursorY += titleLines.length * 14 + 6;

    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(9.5);
    state.pdf.setTextColor(...PDF_THEME.textSoft);
    state.pdf.text(metaLines, state.layout.left + 48, cursorY);
    cursorY += metaLines.length * 12 + 4;

    if (bugBlocks.length) {
      drawPanel(
        state.pdf,
        state.layout.left + 48,
        cursorY,
        state.layout.contentWidth - 64,
        bugBlocks.length * 12 + 18,
        {
          fill: PDF_THEME.dangerSoft,
          stroke: stepTone.stroke,
          radius: 14,
        },
      );
      setPdfBodyFont(state.pdf, "normal");
      state.pdf.setFontSize(9.5);
      state.pdf.setTextColor(...PDF_THEME.danger);
      state.pdf.text(bugBlocks, state.layout.left + 58, cursorY + 14);
    }

    drawSmallBadge(
      state.pdf,
      state.layout.right - badgeWidth - 12,
      state.y + 18,
      badgeWidth,
      20,
      item.statusBadgeLabel || item.statusLabel,
      stepTone,
    );

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

  let cursorY = state.y + 50;
  const textX = state.layout.left + 28;
  items.forEach((item) => {
    const lines = state.pdf.splitTextToSize(cleanText(item), state.layout.contentWidth - 46);
    state.pdf.setFillColor(...bulletColor);
    state.pdf.circle(state.layout.left + 16, cursorY + 4, 2.4, "F");
    setPdfBodyFont(state.pdf, "normal");
    state.pdf.setFontSize(10.5);
    state.pdf.setTextColor(...PDF_THEME.neutral);
    state.pdf.text(lines, textX, cursorY + 8);
    cursorY += lines.length * 13 + 6;
  });

  state.y += panelHeight + 10;
}

function drawSubsectionTitle(state, title) {
  const lines = state.pdf.splitTextToSize(cleanText(title), state.layout.contentWidth);
  ensureSpace(state, Math.max(18, lines.length * 12 + 6));
  setPdfBodyFont(state.pdf, "bold");
  state.pdf.setFontSize(9.5);
  state.pdf.setTextColor(...PDF_THEME.textSoft);
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
    state.pdf.setFontSize(9.5);
    state.pdf.setTextColor(...PDF_THEME.textSoft);
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
  const linesCollection = paragraphs
    .map((paragraph) => state.pdf.splitTextToSize(cleanText(paragraph), state.layout.contentWidth - 34))
    .filter((lines) => lines.length);
  const bodyHeight = linesCollection.reduce((total, lines) => total + lines.length * 13 + 8, 0);
  const boxHeight = Math.max(126, 48 + bodyHeight);

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
  state.pdf.setFontSize(10.5);
  state.pdf.setTextColor(...PDF_THEME.neutral);
  let y = state.y + 84;
  linesCollection.forEach((lines) => {
    state.pdf.text(lines, state.layout.left + 18, y);
    y += lines.length * 13 + 8;
  });

  state.y += boxHeight + 10;
}

function drawTocPages(pdf, layout, report, tocPageNumbers, cardPageMap) {
  const cards = report.tocCards;

  tocPageNumbers.forEach((pageNumber, pageIndex) => {
    pdf.setPage(pageNumber);
    pdf.setFillColor(...PDF_THEME.page);
    pdf.rect(0, 0, layout.width, layout.height, "F");

    let y = layout.top;
    const intro = pageIndex === 0
      ? `${report.detailScope.tocIntro} Chaque entrée renvoie vers la fiche correspondante dans le document.`
      : "Suite du sommaire des cartes testées.";
    const introLines = pdf.splitTextToSize(intro, layout.contentWidth - 36);
    const headerHeight = 72 + introLines.length * 14;

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
    pdf.text(introLines, layout.left + 18, y + 88);
    y += headerHeight + 14;

    const statWidth = (layout.contentWidth - 20) / 3;
    drawDashboardMetaCard(
      pdf,
      layout.left,
      y,
      statWidth,
      "Cartes détaillées",
      `${report.detailScope.detailedCount} / ${report.detailScope.totalCount}`,
    );
    drawDashboardMetaCard(
      pdf,
      layout.left + statWidth + 10,
      y,
      statWidth,
      "Échecs",
      String(report.reportStats.failedCount),
    );
    drawDashboardMetaCard(
      pdf,
      layout.left + (statWidth + 10) * 2,
      y,
      statWidth,
      "En cours",
      String(report.reportStats.partialCount),
    );
    y += 54;

    const rows = cards.slice(pageIndex * TOC_ROWS_PER_PAGE, (pageIndex + 1) * TOC_ROWS_PER_PAGE);
    if (!rows.length) {
      drawTocEmptyState(pdf, layout, y);
      return;
    }

    rows.forEach((card, rowIndex) => {
      const rowHeight = 42;
      drawPanel(pdf, layout.left, y, layout.contentWidth, rowHeight, {
        fill: PDF_THEME.surface,
        stroke: PDF_THEME.border,
        radius: 16,
      });

      pdf.setFillColor(...PDF_THEME.primarySoft);
      pdf.circle(layout.left + 20, y + 21, 10, "F");
      setPdfBodyFont(pdf, "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...PDF_THEME.primary);
      pdf.text(
        String(pageIndex * TOC_ROWS_PER_PAGE + rowIndex + 1).padStart(2, "0"),
        layout.left + 20,
        y + 24,
        { align: "center" },
      );

      setPdfBodyFont(pdf, "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...PDF_THEME.text);
      pdf.text(truncateText(card.title, 48), layout.left + 40, y + 18);

      setPdfBodyFont(pdf, "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...PDF_THEME.textSoft);
      pdf.text(truncateText(`${card.surfaceName} · ${card.pageName}`, 34), layout.left + 40, y + 31);

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
    });
  });
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
  const lines = pdf.splitTextToSize(
    "Une carte entre dans le détail dès qu'au moins une étape a été jouée, ou si des notes, captures ou un statut QA hors « À lancer » sont déjà présents.",
    layout.contentWidth - 36,
  );
  pdf.text(lines, layout.left + 18, y + 88);
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
  const lines = pdf.splitTextToSize(cleanText(value), width - 16).slice(0, 1);
  pdf.text(lines, x + 8, y + 17);
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

    const lines = pdf.splitTextToSize(cleanText(item), width - 14).slice(0, 3);
    const blockHeight = lines.length * lineHeight;
    if (cursorY + blockHeight > limitY) {
      return;
    }

    pdf.setFillColor(...bulletColor);
    pdf.circle(x + 3, cursorY + 4, 2.4, "F");
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...PDF_THEME.neutral);
    pdf.text(lines, x + 12, cursorY + 8);
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
    const lines = pdf.splitTextToSize(cleanText(item), width - 12);
    return total + lines.length * 13 + 6;
  }, 52);
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
    const lines = pdf.splitTextToSize(cleanText(item), width - 28);
    pdf.setFillColor(...tone.accent);
    pdf.circle(x + 14, cursorY + 4, 2.4, "F");
    setPdfBodyFont(pdf, "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...PDF_THEME.neutral);
    pdf.text(lines, x + 24, cursorY + 8);
    cursorY += lines.length * 12 + 6;
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
