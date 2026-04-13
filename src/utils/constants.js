export const STORAGE_VERSION = 6;
export const STORAGE_KEY = `qaredata-qa-board-state-v${STORAGE_VERSION}`;
export const LEGACY_STORAGE_KEYS = [
  "qaredata-qa-board-state-v5",
  "qaredata-qa-board-state-v4",
  "qaredata-qa-board-state-v3",
  "qaredata-qa-board-state-v2",
];

export const DEFAULT_DATA_PATH = "./data/cards.json";
export const CUSTOM_SURFACE_ID = "cartes-perso";
export const DEFAULT_PAGE_NAME = "Recette libre";

export const SURFACE_ORDER = [
  "manager",
  "portail",
  "app-mobile",
  "webview",
  "site-public",
  "transverse",
  CUSTOM_SURFACE_ID,
];

export const STATUS_META = {
  todo: {
    label: "À lancer",
    shortLabel: "Todo",
    score: 0,
    tone: "todo",
    description: "La carte n'a pas encore été rejouée.",
  },
  progress: {
    label: "En cours",
    shortLabel: "En cours",
    score: 50,
    tone: "progress",
    description: "La carte a été testée partiellement ou documentée.",
  },
  done: {
    label: "Validée",
    shortLabel: "Validée",
    score: 100,
    tone: "done",
    description: "La carte est considérée comme validée par le testeur.",
  },
};

export const SEVERITY_META = {
  blocker: {
    label: "Bloquant",
    shortLabel: "P0",
    tone: "blocker",
    rank: 0,
  },
  major: {
    label: "Majeur",
    shortLabel: "P1",
    tone: "major",
    rank: 1,
  },
  minor: {
    label: "Mineur",
    shortLabel: "P2",
    tone: "minor",
    rank: 2,
  },
};

export const SOURCE_STATUS_META = {
  "source-todo": {
    label: "Source : a corriger",
    tone: "source-todo",
  },
  "source-done": {
    label: "Source : stable",
    tone: "source-done",
  },
  "source-neutral": {
    label: "Source : observation",
    tone: "source-neutral",
  },
};

export const PDF_BRAND = {
  companyName: "QareData",
  reportName: "Rapport de sortie QA",
  projectName: "Dashboard QA",
  logoPath: "./assets/company-logo.png",
  logoFallback: "QD",
};

export const PDF_LIBRARY_SOURCES = [
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  },
  {
    src: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  },
];
