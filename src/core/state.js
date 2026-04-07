import {
  CUSTOM_SURFACE_ID,
  DEFAULT_PAGE_NAME,
  PDF_BRAND,
  SEVERITY_META,
  SOURCE_STATUS_META,
  STATUS_META,
  SURFACE_ORDER,
} from "../utils/constants.js?v=20260407-ui-fixes-2";
import {
  cleanText,
  extractMentions,
  generateId,
  safeArray,
  slugify,
  sumBy,
  uniqueTexts,
} from "../utils/format.js?v=20260407-ui-fixes-2";

export function normalizeBoardData(rawBoard = {}) {
  const input = rawBoard && typeof rawBoard === "object" ? rawBoard : {};
  const surfaces = safeArray(input.surfaces).map(normalizeSurface);
  const ensuredSurfaces = ensureCustomSurface(surfaces);

  // Supportter SOIT input.meta SOIT input.metadata (nouveau format)
  const metaSource = input.meta || input.metadata || {};

  return {
    meta: {
      companyName: cleanText(metaSource.companyName) || PDF_BRAND.companyName,
      projectName: cleanText(metaSource.projectName) || PDF_BRAND.projectName,
      reportName: cleanText(metaSource.reportName) || PDF_BRAND.reportName,
      tester: cleanText(metaSource.tester || metaSource.defaultTester),
      environment: cleanText(metaSource.environment || metaSource.defaultEnvironment),
      lastImportedAt: metaSource.lastImportedAt || "",
    },
    surfaces: ensuredSurfaces.sort(sortSurfaces),
  };
}

export function createInitialAppState(board) {
  return {
    board: normalizeBoardData(board),
    filters: {
      search: "",
      surface: "all",
      page: "all",
      status: "all",
      severity: "all",
      onlyNotValidated: false,
      hideDone: false,
    },
  };
}

export function cloneBoard(board) {
  if (typeof structuredClone === "function") {
    return structuredClone(board);
  }
  return JSON.parse(JSON.stringify(board));
}

export function flattenBoard(board) {
  return board.surfaces.flatMap((surface) =>
    surface.pages.flatMap((page) =>
      page.cards.map((card) => ({
        surface,
        page,
        card,
      })),
    ),
  );
}

export function getSurfaceOptions(board) {
  return board.surfaces.map((surface) => ({
    id: surface.id,
    name: surface.name,
  }));
}

export function getPageOptions(board, surfaceId = "all") {
  const entries = flattenBoard(board).filter(({ surface }) =>
    surfaceId === "all" ? true : surface.id === surfaceId,
  );
  const unique = new Map();
  entries.forEach(({ page }) => {
    if (!unique.has(page.id)) {
      unique.set(page.id, {
        id: page.id,
        name: page.name,
      });
    }
  });
  return Array.from(unique.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "fr"),
  );
}

export function getFilteredBoard(board, filters) {
  const normalizedFilters = filters || {};
  const surfaces = board.surfaces
    .map((surface) => ({
      ...surface,
      pages: surface.pages
        .map((page) => ({
          ...page,
          cards: [...page.cards]
            .sort(sortCards)
            .filter((card) =>
              matchesFilters(
                {
                  surface,
                  page,
                  card,
                },
                normalizedFilters,
              ),
            ),
        }))
        .filter((page) => page.cards.length > 0),
    }))
    .filter((surface) => surface.pages.length > 0);

  return surfaces;
}

export function matchesFilters(entry, filters) {
  const { surface, page, card } = entry;
  const searchHaystack = [
    surface.name,
    page.name,
    card.title,
    card.scenarioTitle,
    card.notes,
    card.tester,
    card.environment,
    ...card.checklist.map((item) => item.label),
    ...card.checklist.flatMap((item) => [
      item.bug?.description,
      item.bug?.observedBehavior,
      item.bug?.expectedResult,
      item.tester,
    ]),
    ...card.sourceIssues,
    ...card.validatedPoints,
    ...card.advice,
    ...card.references,
  ]
    .join(" ")
    .toLowerCase();

  const searchMatch =
    !filters.search || searchHaystack.includes(filters.search.toLowerCase());
  const surfaceMatch = filters.surface === "all" || surface.id === filters.surface;
  const pageMatch = filters.page === "all" || page.id === filters.page;
  const statusMatch = filters.status === "all" || card.status === filters.status;
  const severityMatch =
    filters.severity === "all" || card.severity === filters.severity;
  const onlyNotValidatedMatch =
    !filters.onlyNotValidated || card.status !== "done";
  const hideDoneMatch = !filters.hideDone || card.status !== "done";

  return (
    searchMatch
    && surfaceMatch
    && pageMatch
    && statusMatch
    && severityMatch
    && onlyNotValidatedMatch
    && hideDoneMatch
  );
}

export function getCardChecklistMetrics(card) {
  const total = card.checklist.length;
  const checked = card.checklist.filter((item) => item.status !== "pending").length;
  const okCount = card.checklist.filter((item) => item.status === "ok").length;
  const koCount = card.checklist.filter((item) => item.status === "ko").length;
  const progressPercent = total
    ? Math.round((checked / total) * 100)
    : STATUS_META[card.status]?.score || 0;

  return {
    total,
    checked,
    open: Math.max(0, total - checked),
    okCount,
    koCount,
    progressPercent,
  };
}

export function getCardScore(card) {
  return STATUS_META[card.status]?.score || 0;
}

export function getCardRisk(card) {
  return (
    card.checklist.some((item) => item.status === "ko")
    || (Boolean(card.notes.trim()) && card.status !== "done")
  );
}

export function isBugCard(card) {
  return (
    card.checklist.some((item) => item.status === "ko")
    || card.sourceStatus === "source-todo"
    || getCardRisk(card)
    || (card.status !== "done" && card.severity === "blocker")
  );
}

export function getBoardMetrics(board) {
  const cards = flattenBoard(board).map((entry) => entry.card);
  const doneCount = cards.filter((card) => card.status === "done").length;
  const progressCount = cards.filter((card) => card.status === "progress").length;
  const todoCount = cards.filter((card) => card.status === "todo").length;
  const blockersCount = cards.filter(
    (card) => card.severity === "blocker" && card.status !== "done",
  ).length;
  const screenshotsCount = sumBy(cards, (card) => card.screenshots.length);
  const notesCount = cards.filter((card) => card.notes.trim()).length;
  const risksCount = cards.filter(getCardRisk).length;
  const qaScore = cards.length
    ? Math.round(sumBy(cards, (card) => getCardScore(card)) / cards.length)
    : 0;

  return {
    totalCards: cards.length,
    doneCount,
    progressCount,
    todoCount,
    blockersCount,
    screenshotsCount,
    notesCount,
    risksCount,
    qaScore,
  };
}

export function getSurfaceMetrics(surface) {
  const cards = surface.pages.flatMap((page) => page.cards);
  const doneCount = cards.filter((card) => card.status === "done").length;
  const progressCount = cards.filter((card) => card.status === "progress").length;
  const todoCount = cards.filter((card) => card.status === "todo").length;
  const blockersCount = cards.filter(
    (card) => card.severity === "blocker" && card.status !== "done",
  ).length;
  const qaScore = cards.length
    ? Math.round(sumBy(cards, (card) => getCardScore(card)) / cards.length)
    : 0;

  return {
    totalCards: cards.length,
    doneCount,
    progressCount,
    todoCount,
    blockersCount,
    qaScore,
  };
}

export function getTopProblems(board, limit = 6) {
  return flattenBoard(board)
    .filter(({ card }) => card.status !== "done")
    .sort((left, right) => {
      const bySeverity =
        getSeverityRank(left.card.severity) - getSeverityRank(right.card.severity);
      if (bySeverity !== 0) {
        return bySeverity;
      }
      const byRisk = Number(getCardRisk(right.card)) - Number(getCardRisk(left.card));
      if (byRisk !== 0) {
        return byRisk;
      }
      return left.card.title.localeCompare(right.card.title, "fr");
    })
    .slice(0, limit);
}

export function updateBoardMeta(board, patch) {
  const nextBoard = cloneBoard(board);
  nextBoard.meta = {
    ...nextBoard.meta,
    ...patch,
  };
  return normalizeBoardData(nextBoard);
}

export function createManualCard(board, payload) {
  const nextBoard = cloneBoard(board);
  const surfaceId = cleanText(payload.surfaceId) || CUSTOM_SURFACE_ID;
  const pageName = cleanText(payload.pageName) || DEFAULT_PAGE_NAME;
  const title = cleanText(payload.title);
  const scenarioSteps = String(
    payload.scenarioSteps || payload.firstChecklistItem || "",
  )
    .split(/\n+/)
    .map((item) => cleanText(item))
    .filter(Boolean);

  if (!title) {
    throw new Error("Le titre de la carte est obligatoire.");
  }

  const surface = ensureSurface(nextBoard, surfaceId, payload.surfaceName);
  const page = ensurePage(surface, pageName);
  page.cards.push(
    normalizeCard({
      id: generateId("manual-card"),
      title,
      scenarioTitle: title,
      status: "todo",
      sourceStatus: "source-neutral",
      severity: payload.severity || "major",
      tester: "",
      environment: "",
      notes: String(payload.notes || "").trim(),
      screenshots: [],
      collapsed: true,
      checklist: (scenarioSteps.length
        ? scenarioSteps
        : [`Réaliser le scénario principal "${title}" avec des données cohérentes.`]
      ).map((label, index) => ({
        id: generateId("chk"),
        label: toUserScenarioStepLabel(label, title, index),
        status: "pending",
        bug: createEmptyStepBug(),
        timestamp: "",
        tester: "",
        origin: "manual",
      })),
      sourceIssues: [],
      validatedPoints: [],
      advice: [],
      references: extractMentions([payload.notes || ""]),
      isManual: true,
    }),
  );

  page.cards.sort(sortCards);
  surface.pages.sort(sortPages);
  nextBoard.surfaces.sort(sortSurfaces);
  return normalizeBoardData(nextBoard);
}

export function deleteCard(board, cardId) {
  const nextBoard = cloneBoard(board);
  nextBoard.surfaces.forEach((surface) => {
    surface.pages.forEach((page) => {
      page.cards = page.cards.filter((card) => card.id !== cardId);
    });
    surface.pages = surface.pages.filter(
      (page) => page.cards.length > 0 || surface.id !== CUSTOM_SURFACE_ID,
    );
  });
  nextBoard.surfaces = nextBoard.surfaces.filter(
    (surface) => surface.id !== CUSTOM_SURFACE_ID || surface.pages.length > 0,
  );
  return normalizeBoardData(ensureCustomSurface(nextBoard.surfaces, nextBoard.meta));
}

export function setCardField(board, cardId, field, value) {
  return updateCard(board, cardId, (card) => {
    const nextCard = { ...card };
    if (field === "status") {
      nextCard.status = normalizeStatus(value);
      return nextCard;
    }

    if (field === "severity") {
      nextCard.severity = normalizeSeverity(value);
      return nextCard;
    }

    nextCard[field] = typeof value === "string" ? value : value ?? "";
    if (field === "notes") {
      nextCard.references = uniqueTexts([
        ...nextCard.references,
        ...extractMentions([nextCard.notes]),
      ]);
      return syncCardStatus(nextCard);
    }
    return nextCard;
  });
}

export function markScenarioStepOk(board, cardId, checklistId, tester = "") {
  return updateCard(board, cardId, (card) => {
    const nextChecklist = card.checklist.map((item) =>
      item.id === checklistId
        ? {
          ...item,
          status: "ok",
          bug: createEmptyStepBug(),
          timestamp: new Date().toISOString(),
          tester: cleanText(tester),
        }
        : item,
    );
    return syncCardStatus({
      ...card,
      checklist: nextChecklist,
    });
  });
}

export function clearScenarioStepResult(board, cardId, checklistId) {
  return updateCard(board, cardId, (card) => {
    const nextChecklist = card.checklist.map((item) =>
      item.id === checklistId
        ? {
          ...item,
          status: "pending",
          bug: createEmptyStepBug(),
          timestamp: "",
          tester: "",
        }
        : item,
    );

    return syncCardStatus({
      ...card,
      checklist: nextChecklist,
    });
  });
}

export function saveScenarioStepBug(board, cardId, checklistId, bugPayload, tester = "") {
  const bug = normalizeStepBug(bugPayload);
  if (!hasBugDetails(bug)) {
    throw new Error("Le bug doit contenir une description, le comportement observé et le résultat attendu.");
  }

  return updateCard(board, cardId, (card) => {
    const nextChecklist = card.checklist.map((item) =>
      item.id === checklistId
        ? {
          ...item,
          status: "ko",
          bug,
          timestamp: new Date().toISOString(),
          tester: cleanText(tester),
        }
        : item,
    );

    return syncCardStatus({
      ...card,
      checklist: nextChecklist,
    });
  });
}

export function addScenarioStep(board, cardId, label) {
  const cleaned = cleanText(label);
  if (!cleaned) {
    return board;
  }

  return updateCard(board, cardId, (card) =>
    syncCardStatus({
      ...card,
      checklist: [
        ...card.checklist,
        {
          id: generateId("chk"),
          label: toUserScenarioStepLabel(cleaned, card.scenarioTitle || card.title, card.checklist.length),
          status: "pending",
          bug: createEmptyStepBug(),
          timestamp: "",
          tester: "",
          origin: "manual",
        },
      ],
    }));
}

export function removeScenarioStep(board, cardId, checklistId) {
  return updateCard(board, cardId, (card) =>
    syncCardStatus({
      ...card,
      checklist: card.checklist.filter((item) => item.id !== checklistId),
    }));
}

export function toggleChecklistItem(board, cardId, checklistId, checked) {
  return updateCard(board, cardId, (card) => {
    const nextChecklist = card.checklist.map((item) =>
      item.id === checklistId
        ? {
          ...item,
          status: checked ? "ok" : "pending",
          bug: checked ? createEmptyStepBug() : item.bug,
          timestamp: checked ? new Date().toISOString() : "",
        }
        : item,
    );

    return syncCardStatus({
      ...card,
      checklist: nextChecklist,
    });
  });
}

export const addChecklistItem = addScenarioStep;
export const removeChecklistItem = removeScenarioStep;

export function toggleCardCollapsed(board, cardId) {
  return updateCard(board, cardId, (card) => ({
    ...card,
    collapsed: !card.collapsed,
  }));
}

export function collapseAllCards(board) {
  const nextBoard = cloneBoard(board);
  nextBoard.surfaces = nextBoard.surfaces.map((surface) => ({
    ...surface,
    pages: surface.pages.map((page) => ({
      ...page,
      cards: page.cards.map((card) => ({
        ...card,
        collapsed: true,
      })),
    })),
  }));
  return normalizeBoardData(nextBoard);
}

export function addScreenshot(board, cardId, screenshot) {
  return updateCard(board, cardId, (card) =>
    syncCardStatus({
      ...card,
      screenshots: [...card.screenshots, screenshot].slice(-6),
    }));
}

export function removeScreenshot(board, cardId, screenshotId) {
  return updateCard(board, cardId, (card) =>
    syncCardStatus({
      ...card,
      screenshots: card.screenshots.filter((item) => item.id !== screenshotId),
    }));
}

export function syncCardStatus(card) {
  const checklist = safeArray(card.checklist);
  const resolvedCount = checklist.filter((item) => item.status !== "pending").length;
  const okCount = checklist.filter((item) => item.status === "ok").length;

  let nextStatus = normalizeStatus(card.status);
  if (checklist.length && okCount === checklist.length) {
    nextStatus = "done";
  } else if (resolvedCount > 0 || card.notes.trim() || card.screenshots.length) {
    nextStatus = "progress";
  } else if (!checklist.length && nextStatus === "done") {
    nextStatus = "done";
  } else if (!checklist.length && (card.notes.trim() || card.screenshots.length)) {
    nextStatus = "progress";
  } else if (resolvedCount === 0) {
    nextStatus = "todo";
  }

  return {
    ...card,
    status: nextStatus,
  };
}

export function getCardStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.todo;
}

export function getSeverityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.major;
}

export function getSourceStatusMeta(sourceStatus) {
  return (
    SOURCE_STATUS_META[sourceStatus]
    || SOURCE_STATUS_META["source-neutral"]
  );
}

function normalizeSurface(surface = {}) {
  return {
    id: cleanText(surface.id) || slugify(surface.name || "surface"),
    name: cleanText(surface.name) || "Surface",
    description: cleanText(surface.description),
    pages: safeArray(surface.pages)
      .map(normalizePage)
      .sort(sortPages),
  };
}

function normalizePage(page = {}) {
  return {
    id: cleanText(page.id) || slugify(page.name || DEFAULT_PAGE_NAME),
    name: cleanText(page.name) || DEFAULT_PAGE_NAME,
    cards: safeArray(page.cards)
      .map(normalizeCard)
      .sort(sortCards),
  };
}

function normalizeCard(card = {}) {
  const normalized = {
    id: cleanText(card.id) || generateId("card"),
    title: cleanText(card.title) || "Carte QA",
    scenarioTitle: cleanText(card.scenarioTitle || card.title) || "Scenario utilisateur",
    status: normalizeStatus(card.status),
    sourceStatus: normalizeSourceStatus(card.sourceStatus),
    severity: normalizeSeverity(card.severity),
    tester: cleanText(card.tester),
    environment: cleanText(card.environment),
    notes: String(card.notes ?? ""),
    screenshots: safeArray(card.screenshots).map((item, index) => ({
      id: cleanText(item.id) || generateId(`shot-${index}`),
      name: cleanText(item.name) || `Screenshot ${index + 1}`,
      dataUrl: String(item.dataUrl || item.url || ""),
      createdAt: item.createdAt || "",
    })).filter((item) => item.dataUrl),
    collapsed: typeof card.collapsed === "boolean" ? card.collapsed : true,
    checklist: safeArray(card.checklist || card.steps || card.scenario?.steps)
      .map((item, index) => normalizeScenarioStep(item, index, card.scenarioTitle || card.title)),
    sourceIssues: uniqueTexts(card.sourceIssues || card.todos || []),
    validatedPoints: uniqueTexts(card.validatedPoints || card.validated || []),
    advice: uniqueTexts(card.advice || []),
    references: uniqueTexts([
      ...(card.references || []),
      ...extractMentions([
        ...(card.references || []),
        card.notes || "",
        ...(card.sourceIssues || []),
        ...(card.validatedPoints || []),
        ...(card.advice || []),
      ]),
    ]),
    isManual: Boolean(card.isManual),
    legacyContext: card.legacyContext && typeof card.legacyContext === "object"
      ? card.legacyContext
      : {},
  };

  return syncCardStatus(normalized);
}

function normalizeScenarioStep(step = {}, index = 0, scenarioTitle = "Carte QA") {
  const status = normalizeScenarioStepStatus(step.status, step.checked);
  const bug = normalizeStepBug(step.bug);
  const nextStatus = status === "ko" && !hasBugDetails(bug) ? "pending" : status;

  return {
    id: cleanText(step.id) || generateId(`chk-${index}`),
    label: toUserScenarioStepLabel(
      step.label || step.text,
      cleanText(scenarioTitle) || "Carte QA",
      index,
    ),
    status: nextStatus,
    bug: nextStatus === "ko" ? bug : createEmptyStepBug(),
    timestamp: step.timestamp || step.testedAt || "",
    tester: cleanText(step.tester || step.testedBy),
    origin: step.origin === "manual" ? "manual" : "seed",
  };
}

function normalizeScenarioStepStatus(status, checked) {
  if (status === "ok" || status === "ko" || status === "pending") {
    return status;
  }

  return checked ? "ok" : "pending";
}

function createEmptyStepBug() {
  return {
    description: "",
    observedBehavior: "",
    expectedResult: "",
  };
}

function normalizeStepBug(bug = {}) {
  return {
    description: String(bug?.description ?? "").trim(),
    observedBehavior: String(bug?.observedBehavior ?? "").trim(),
    expectedResult: String(bug?.expectedResult ?? "").trim(),
  };
}

function hasBugDetails(bug = {}) {
  return Boolean(
    String(bug.description || "").trim()
    && String(bug.observedBehavior || "").trim()
    && String(bug.expectedResult || "").trim(),
  );
}

function toUserScenarioStepLabel(label, scenarioTitle, index = 0) {
  const cleaned = cleanText(label);
  if (!cleaned) {
    return `Réaliser l'étape ${index + 1} du scénario "${scenarioTitle}".`;
  }

  const patterns = [
    {
      test: /^ouvrir .*atteindre le flux /i,
      value: `Accéder au scénario "${scenarioTitle}" depuis l'interface concernée.`,
    },
    {
      test: /^executer le scenario principal/i,
      value: `Réaliser le parcours principal du scénario "${scenarioTitle}" avec des données cohérentes.`,
    },
    {
      test: /^verifier que ce point ne se reproduit plus\s*:/i,
      value: `Vérifier que ${cleanScenarioTail(cleaned.split(":").slice(1).join(":"))}`,
    },
    {
      test: /^comparer le comportement observe avec cette attente\s*:/i,
      value: `Confirmer que ${cleanScenarioTail(cleaned.split(":").slice(1).join(":"))}`,
    },
    {
      test: /^confirmer qu'il n'y a pas de regression sur\s*:/i,
      value: `Contrôler qu'il n'y a pas de régression sur ${cleanScenarioTail(cleaned.split(":").slice(1).join(":"))}`,
    },
    {
      test: /^verifier la sauvegarde/i,
      value: "Vérifier la sauvegarde et le retour utilisateur après validation.",
    },
  ];

  const matchingPattern = patterns.find((entry) => entry.test.test(cleaned));
  if (matchingPattern) {
    return matchingPattern.value;
  }

  return cleaned;
}

function cleanScenarioTail(value) {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.charAt(0).toLowerCase() + cleaned.slice(1) : "le comportement attendu est bien respecté.";
}

function updateCard(board, cardId, updater) {
  const nextBoard = cloneBoard(board);
  nextBoard.surfaces = nextBoard.surfaces.map((surface) => ({
    ...surface,
    pages: surface.pages.map((page) => ({
      ...page,
      cards: page.cards.map((card) =>
        card.id === cardId ? normalizeCard(updater(card)) : card),
    })),
  }));
  return normalizeBoardData(nextBoard);
}

function ensureSurface(board, surfaceId, surfaceName) {
  let surface = board.surfaces.find((entry) => entry.id === surfaceId);
  if (surface) {
    return surface;
  }

  surface = {
    id: surfaceId,
    name: cleanText(surfaceName) || guessSurfaceName(surfaceId),
    description: "",
    pages: [],
  };
  board.surfaces.push(surface);
  return surface;
}

function ensurePage(surface, pageName) {
  const pageId = slugify(pageName) || slugify(DEFAULT_PAGE_NAME);
  let page = surface.pages.find((entry) => entry.id === pageId);
  if (page) {
    return page;
  }

  page = {
    id: pageId,
    name: pageName,
    cards: [],
  };
  surface.pages.push(page);
  return page;
}

function ensureCustomSurface(surfaces = [], meta) {
  const nextSurfaces = [...surfaces];
  if (!nextSurfaces.some((surface) => surface.id === CUSTOM_SURFACE_ID)) {
    nextSurfaces.push(
      normalizeSurface({
        id: CUSTOM_SURFACE_ID,
        name: "Cartes perso",
        description: "Cartes créées manuellement pendant la recette.",
        pages: [],
      }),
    );
  }

  if (meta) {
    return {
      meta,
      surfaces: nextSurfaces,
    };
  }

  return nextSurfaces;
}

function normalizeStatus(status) {
  return STATUS_META[status] ? status : "todo";
}

function normalizeSeverity(severity) {
  return SEVERITY_META[severity] ? severity : "major";
}

function normalizeSourceStatus(sourceStatus) {
  return SOURCE_STATUS_META[sourceStatus] ? sourceStatus : "source-neutral";
}

function getSeverityRank(severity) {
  return SEVERITY_META[severity]?.rank ?? 99;
}

function sortSurfaces(left, right) {
  const leftIndex = SURFACE_ORDER.indexOf(left.id);
  const rightIndex = SURFACE_ORDER.indexOf(right.id);
  if (leftIndex !== rightIndex) {
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  }
  return left.name.localeCompare(right.name, "fr");
}

function sortPages(left, right) {
  return left.name.localeCompare(right.name, "fr");
}

function sortCards(left, right) {
  const byStatus = getStatusSortRank(left.status) - getStatusSortRank(right.status);
  if (byStatus !== 0) {
    return byStatus;
  }

  const bySeverity = getSeverityRank(left.severity) - getSeverityRank(right.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }

  const byRisk = Number(getCardRisk(right)) - Number(getCardRisk(left));
  if (byRisk !== 0) {
    return byRisk;
  }

  return left.title.localeCompare(right.title, "fr");
}

function getStatusSortRank(status) {
  switch (status) {
    case "progress":
      return 0;
    case "todo":
      return 1;
    case "done":
      return 2;
    default:
      return 99;
  }
}

function guessSurfaceName(surfaceId) {
  if (surfaceId === CUSTOM_SURFACE_ID) {
    return "Cartes perso";
  }
  return cleanText(surfaceId).replace(/-/g, " ");
}
