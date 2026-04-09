import {
  CUSTOM_SURFACE_ID,
  DEFAULT_DATA_PATH,
  DEFAULT_PAGE_NAME,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../utils/constants.js?v=20260407-ui-fixes-2";
import { cleanText, generateId } from "../utils/format.js?v=20260407-ui-fixes-2";
import { cloneBoard, normalizeBoardData } from "./state.js?v=20260409-crud-cards-3";

export async function loadCards() {
  const currentState = readStoredBoard(STORAGE_KEY);
  const legacy = readLegacyBoard();
  let seed;

  try {
    seed = await loadSeedBoard();
  } catch (error) {
    if (currentState) {
      return normalizeBoardData(currentState);
    }

    if (legacy) {
      return normalizeBoardData(legacy);
    }

    throw error;
  }

  if (currentState) {
    return mergeBoards(seed, currentState);
  }

  if (legacy) {
    return mergeBoards(seed, legacy);
  }

  return seed;
}

export function saveCards(data) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      board: normalizeBoardData(data),
    }),
  );
}

export function clearSavedCards() {
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

export function buildExportPayload(board) {
  return {
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    board: normalizeBoardData(board),
  };
}

export function parseImportedBoard(payload) {
  const candidate = payload?.board || payload?.state?.board || payload;
  return normalizeBoardData(candidate);
}

function readStoredBoard(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return normalizeBoardData(parsed.board || parsed);
  } catch {
    return null;
  }
}

function readLegacyBoard() {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      const migrated = migrateLegacyPayload(parsed);
      if (migrated) {
        return migrated;
      }
    } catch {
      // ignore malformed legacy state
    }
  }

  return null;
}

async function loadSeedBoard() {
  const candidateUrls = [
    new URL("../../data/cards.json", import.meta.url).toString(),
    DEFAULT_DATA_PATH,
  ];
  let lastError = null;

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`Impossible de charger ${url} (${response.status})`);
        continue;
      }

      return normalizeBoardData(await response.json());
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : `Impossible de charger ${DEFAULT_DATA_PATH}`,
  );
}

function migrateLegacyPayload(rawLegacy = {}) {
  const legacy = rawLegacy?.state || rawLegacy;
  if (!legacy || typeof legacy !== "object") {
    return null;
  }

  const board = normalizeBoardData({
    meta: {
      companyName: rawLegacy.companyName,
      projectName: rawLegacy.projectName,
      reportName: rawLegacy.reportName,
    },
    surfaces: [],
  });

  const items = legacy.items && typeof legacy.items === "object" ? legacy.items : {};
  const manualItems = Array.isArray(legacy.manualItems) ? legacy.manualItems : [];

  board.legacyItems = items;
  board.legacyManualItems = manualItems;
  return board;
}

function mergeBoards(baseBoard, savedBoard) {
  const base = cloneBoard(baseBoard);
  const saved = normalizeBoardData(savedBoard);

  base.meta = {
    ...base.meta,
    ...saved.meta,
  };
  base.deletedCardIds = Array.from(new Set([...(base.deletedCardIds || []), ...(saved.deletedCardIds || [])]));
  applyDeletedCards(base, base.deletedCardIds);

  if (savedBoard?.legacyItems || savedBoard?.legacyManualItems) {
    applyLegacyState(base, savedBoard.legacyItems || {}, savedBoard.legacyManualItems || []);
    return normalizeBoardData(base);
  }

  saved.surfaces.forEach((savedSurface) => {
    let surface = base.surfaces.find((entry) => entry.id === savedSurface.id);
    if (!surface) {
      base.surfaces.push(savedSurface);
      return;
    }

    savedSurface.pages.forEach((savedPage) => {
      let page = surface.pages.find((entry) => entry.id === savedPage.id);
      if (!page) {
        surface.pages.push(savedPage);
        return;
      }

      savedPage.cards.forEach((savedCard) => {
        const existingCard = page.cards.find((entry) => entry.id === savedCard.id);
        if (!existingCard) {
          page.cards.push(savedCard);
          return;
        }

        mergeCardState(existingCard, savedCard);
      });
    });
  });

  return normalizeBoardData(base);
}

function mergeCardState(baseCard, savedCard) {
  baseCard.title = savedCard.title || baseCard.title;
  baseCard.scenarioTitle = savedCard.scenarioTitle || baseCard.scenarioTitle;
  baseCard.status = savedCard.status;
  baseCard.sourceStatus = savedCard.sourceStatus;
  baseCard.severity = savedCard.severity;
  baseCard.tester = savedCard.tester;
  baseCard.environment = savedCard.environment;
  baseCard.notes = savedCard.notes;
  baseCard.screenshots = savedCard.screenshots;
  baseCard.collapsed = savedCard.collapsed;
  baseCard.references = savedCard.references || [];
  baseCard.sourceIssues = savedCard.sourceIssues || [];
  baseCard.validatedPoints = savedCard.validatedPoints || [];
  baseCard.advice = savedCard.advice || [];
  baseCard.legacyContext = savedCard.legacyContext || {};
  baseCard.checklist = savedCard.checklist || [];
  baseCard.isManual = Boolean(savedCard.isManual);
}

function applyDeletedCards(board, deletedCardIds = []) {
  if (!deletedCardIds.length) {
    return;
  }

  const deleted = new Set(deletedCardIds);
  board.surfaces.forEach((surface) => {
    surface.pages.forEach((page) => {
      page.cards = page.cards.filter((card) => !deleted.has(card.id));
    });
    surface.pages = surface.pages.filter(
      (page) => page.cards.length > 0 || surface.id !== CUSTOM_SURFACE_ID,
    );
  });
  board.surfaces = board.surfaces.filter(
    (surface) => surface.id !== CUSTOM_SURFACE_ID || surface.pages.length > 0,
  );
}

function applyLegacyState(board, legacyItems, manualItems) {
  board.surfaces.forEach((surface) => {
    surface.pages.forEach((page) => {
      page.cards.forEach((card) => {
        const legacyState = legacyItems[card.id];
        if (!legacyState) {
          return;
        }

        card.checklist = card.checklist.map((item, index) => ({
          ...item,
          status: legacyState.todoChecks?.[`source-${index}`] ? "ok" : "pending",
          bug: item.bug || {
            description: "",
            observedBehavior: "",
            expectedResult: "",
          },
          timestamp: legacyState.todoChecks?.[`source-${index}`]
            ? new Date().toISOString()
            : "",
        }));

        safeLegacyTasks(legacyState.customTasks).forEach((task) => {
          card.checklist.push({
            id: cleanText(task.id) || generateId("chk"),
            label: cleanText(task.text) || "Point a verifier",
            status: task.done ? "ok" : "pending",
            bug: {
              description: "",
              observedBehavior: "",
              expectedResult: "",
            },
            timestamp: task.done ? new Date().toISOString() : "",
            tester: "",
            origin: "manual",
          });
        });

        card.notes = typeof legacyState.notes === "string" ? legacyState.notes : "";
        card.legacyContext = {
          testHow: typeof legacyState.testHow === "string" ? legacyState.testHow : "",
          expectedResult:
            typeof legacyState.expectedResult === "string"
              ? legacyState.expectedResult
              : "",
        };

        if (legacyState.manualCompleted) {
          card.status = "done";
        } else if (
          card.checklist.some((item) => item.status !== "pending")
          || card.notes.trim()
        ) {
          card.status = "progress";
        } else {
          card.status = "todo";
        }
      });
    });
  });

  if (!manualItems.length) {
    return;
  }

  let customSurface = board.surfaces.find((surface) => surface.id === CUSTOM_SURFACE_ID);
  if (!customSurface) {
    customSurface = {
      id: CUSTOM_SURFACE_ID,
      name: "Cartes perso",
      description: "Cartes migrées depuis un état local antérieur.",
      pages: [],
    };
    board.surfaces.push(customSurface);
  }

  manualItems.forEach((manualItem) => {
    const legacyState = legacyItems[manualItem.id] || {};
    const pageName = cleanText(manualItem.sectionTitle) || DEFAULT_PAGE_NAME;
    const pageId = cleanText(manualItem.sectionId) || generateId("page");
    let page = customSurface.pages.find((entry) => entry.id === pageId);
    if (!page) {
      page = {
        id: pageId,
        name: pageName,
        cards: [],
      };
      customSurface.pages.push(page);
    }

    page.cards.push({
      id: cleanText(manualItem.id) || generateId("manual-card"),
      title: cleanText(manualItem.title) || "Carte migrée",
      scenarioTitle: cleanText(manualItem.title) || "Carte migrée",
      status: legacyState.manualCompleted
        ? "done"
        : safeLegacyTasks(legacyState.customTasks).some((task) => task.done)
          || Boolean(legacyState.notes)
          ? "progress"
          : "todo",
      sourceStatus: manualItem.sourceStatus || "source-neutral",
      severity: manualItem.sourceStatus === "source-todo" ? "major" : "minor",
      tester: "",
      environment: "",
      notes: typeof legacyState.notes === "string" ? legacyState.notes : "",
      screenshots: [],
      collapsed: true,
      checklist: safeLegacyTasks(legacyState.customTasks).map((task) => ({
        id: cleanText(task.id) || generateId("chk"),
        label: cleanText(task.text) || "Point a verifier",
        status: task.done ? "ok" : "pending",
        bug: {
          description: "",
          observedBehavior: "",
          expectedResult: "",
        },
        timestamp: task.done ? new Date().toISOString() : "",
        tester: "",
        origin: "manual",
      })),
      sourceIssues: [],
      validatedPoints: [],
      advice: [],
      references: [],
      isManual: true,
      legacyContext: {
        testHow: typeof legacyState.testHow === "string" ? legacyState.testHow : "",
        expectedResult:
          typeof legacyState.expectedResult === "string"
            ? legacyState.expectedResult
            : "",
      },
    });
  });
}

function safeLegacyTasks(value) {
  return Array.isArray(value) ? value : [];
}
