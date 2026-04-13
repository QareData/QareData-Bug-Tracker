import { buildExportPayload, clearSavedCards, loadCards, parseImportedBoard, saveCards } from "./core/dataLoader.js?v=20260409-crud-cards-3";
import { createStore } from "./core/store.js?v=20260409-crud-cards-3";
import {
  collapseAllCards,
  addScenarioStep,
  addScreenshot,
  clearScenarioStepResult,
  createInitialAppState,
  deleteCard,
  markScenarioStepOk,
  removeScenarioStep,
  removeScreenshot,
  saveScenarioStepBug,
  setCardField,
  upsertCardDefinition,
  updateBoardMeta,
} from "./core/state.js?v=20260409-crud-cards-3";
import { generatePdfReport } from "./services/pdf.service.js?v=20260409-crud-cards-3";
import { downloadMarkdownReport } from "./services/report.service.js?v=20260409-crud-cards-3";
import {
  askRandomQaSimulationSettings,
  runRandomQaSimulation,
} from "./services/test-simulator.service.js?v=20260409-test-simulator-2";
import { renderApp } from "./ui/render.js?v=20260409-crud-cards-3";
import { renderCardDetailed } from "./ui/components/card-detailed.js?v=20260409-crud-cards-3";
import { syncSidebarOptions } from "./ui/components/filters.js?v=20260409-crud-cards-3";
import { downloadBlob, formatFileStamp, readJsonFile, generateId } from "./utils/format.js?v=20260409-crud-cards-3";

const elements = getElements();
let activeModalCardId = null;
const cardEditorState = {
  cardId: null,
};
const SIDEBAR_COLLAPSED_STORAGE_KEY = "qa-sidebar-collapsed";
const store = createStore({
  board: null,
  filters: {
    search: "",
    surface: "all",
    page: "all",
    status: "all",
    severity: "all",
    onlyNotValidated: false,
    hideDone: false,
  },
});

init().catch((error) => {
  console.error(error);
  updateSaveStatus("Erreur au chargement du QA board.");
  const errorDetail = error instanceof Error ? error.message : "Erreur inconnue.";
  elements.boardRoot.innerHTML = `
    <div class="empty-state">
      Impossible de charger les données du board. Vérifie la présence de <code>data/cards.json</code>.
      <p>${errorDetail}</p>
    </div>
  `;
});

async function init() {
  initTheme();
  initSidebarState();
  const board = collapseAllCards(await loadCards());
  store.setState(createInitialAppState(board));
  saveCards(board);
  bindEvents();
  render();
  resetCardEditor();
  updateSaveStatus("Board QA chargé. Sauvegarde locale active.");
  maybeRunTestMode();
}

function bindEvents() {
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", (event) => {
      updateFilters({
        search: event.target.value.trim(),
        page: "all",
      });
    });
  }

  elements.surfaceFilter?.addEventListener("change", (event) => {
    updateFilters({
      surface: event.target.value,
      page: "all",
    });
  });

  elements.pageFilter?.addEventListener("change", (event) => {
    updateFilters({
      page: event.target.value,
    });
  });

  elements.statusFilter?.addEventListener("change", (event) => {
    updateFilters({
      status: event.target.value,
    });
  });

  elements.severityFilter?.addEventListener("change", (event) => {
    updateFilters({
      severity: event.target.value,
    });
  });

  elements.onlyNotValidatedInput?.addEventListener("change", (event) => {
    updateFilters({
      onlyNotValidated: event.target.checked,
    });
  });

  elements.hideDoneInput?.addEventListener("change", (event) => {
    updateFilters({
      hideDone: event.target.checked,
    });
  });

  [elements.projectInput, elements.testerInput, elements.environmentInput].forEach((input) => {
    input.addEventListener("input", handleMetaInput);
    input.addEventListener("change", handleMetaChange);
  });

  elements.openCardEditorButton?.addEventListener("click", () => openCardEditor());
  elements.createCardButton?.addEventListener("click", handleCreateCard);
  elements.cancelCardEditorButton?.addEventListener("click", handleCancelCardEditor);
  elements.deleteCardEditorButton?.addEventListener("click", handleDeleteEditorCard);
  elements.newCardSurface?.addEventListener("change", handleCardEditorSurfaceChange);
  elements.cardEditorPanel?.addEventListener("input", handleCardEditorValidationInteraction);
  elements.cardEditorPanel?.addEventListener("change", handleCardEditorValidationInteraction);
  elements.newCardChecklistCount?.addEventListener("change", handleChecklistCountChange);
  elements.addChecklistStepButton?.addEventListener("click", handleAddChecklistStep);
  elements.cardEditorChecklistRoot?.addEventListener("click", handleCardEditorChecklistClick);
  elements.exportButton?.addEventListener("click", handleExportJson);
  elements.importButton?.addEventListener("click", () => elements.importInput?.click());
  elements.importInput?.addEventListener("change", handleImportJson);
  elements.generateMarkdownButton.addEventListener("click", handleGenerateMarkdown);
  elements.generatePdfButton.addEventListener("click", handleGeneratePdf);
  elements.resetButton.addEventListener("click", handleReset);
  elements.themeButton?.addEventListener("click", handleThemeToggle);
  elements.sidebarRoot?.addEventListener("click", handleSidebarNavigationClick);

  elements.modalClose?.addEventListener("click", closeCardModal);
  elements.modalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.modalOverlay) {
      closeCardModal();
    }
  });
  elements.cardEditorClose?.addEventListener("click", closeCardEditorModal);
  elements.cardEditorOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.cardEditorOverlay) {
      closeCardEditorModal();
    }
  });
  document.addEventListener("keydown", handleDocumentKeydown);

  elements.boardRoot.addEventListener("click", handleBoardClick);
  elements.boardRoot.addEventListener("keydown", handleBoardKeydown);
  elements.boardRoot.addEventListener("change", handleBoardChange);
  elements.boardRoot.addEventListener("input", handleBoardInput);
  elements.boardRoot.addEventListener("dragover", handleBoardDragOver);
  elements.boardRoot.addEventListener("dragleave", handleBoardDragLeave);
  elements.boardRoot.addEventListener("drop", handleBoardDrop);

  elements.modalContent?.addEventListener("click", handleBoardClick);
  elements.modalContent?.addEventListener("change", handleBoardChange);
  elements.modalContent?.addEventListener("input", handleBoardInput);
  elements.modalContent?.addEventListener("dragover", handleBoardDragOver);
  elements.modalContent?.addEventListener("dragleave", handleBoardDragLeave);
  elements.modalContent?.addEventListener("drop", handleBoardDrop);
}

function render() {
  const state = store.getState();
  syncSidebarOptions(state.board, elements, state.filters);
  syncStaticFields(state);
  renderApp(state, elements);
  syncCardEditorUi();
}

function updateFilters(patch) {
  store.setState((current) => ({
    ...current,
    filters: {
      ...current.filters,
      ...patch,
    },
  }));
  render();
}

function handleMetaInput(event) {
  const field = event.target.dataset.field;
  updateBoard(
    (board) =>
      updateBoardMeta(board, {
        [field]: event.target.value,
      }),
    "Métadonnées enregistrées.",
    false,
    false,
  );
  syncStaticFields(store.getState());
}

function handleMetaChange() {
  render();
}

function handleCreateCard() {
  const previousCardId = cardEditorState.cardId;
  const nextCardId = previousCardId || generateId("manual-card");
  const isEditing = Boolean(previousCardId);
  const validation = validateCardEditorRequiredFields();

  if (!validation.isValid) {
    focusFirstInvalidCardEditorField(validation.missingFields);
    updateSaveStatus("Complète les champs obligatoires avant d'enregistrer la carte.");
    window.alert(buildCardEditorValidationMessage(validation.missingLabels));
    return;
  }

  try {
    const payload = readCardEditorPayload(nextCardId);
    cardEditorState.cardId = nextCardId;
    updateBoard(
      (board) => upsertCardDefinition(board, payload),
      isEditing ? "Carte mise à jour localement." : "Carte QA créée localement.",
    );

    const savedContext = findCardContext(store.getState().board, nextCardId);
    if (savedContext) {
      populateCardEditor(savedContext);
    } else {
      cardEditorState.cardId = previousCardId;
    }

    if (!isEditing) {
      window.alert(
        "La carte a bien été ajoutée localement.\n\nPour qu'elle soit vraiment prise en compte, exporte le JSON puis envoie-le sur Discord ou remplace le fichier sur GitHub.",
      );
    }
  } catch (error) {
    cardEditorState.cardId = previousCardId;
    updateSaveStatus(error instanceof Error ? error.message : "Impossible d'enregistrer la carte.");
    if (error instanceof Error && error.message) {
      window.alert(error.message);
    }
    elements.newCardTitle?.focus();
  }
}

function handleCancelCardEditor() {
  if (cardEditorState.cardId) {
    resetCardEditor();
    openCardEditorModal();
    return;
  }

  closeCardEditorModal();
}

function handleDeleteEditorCard() {
  if (!cardEditorState.cardId) {
    closeCardEditorModal();
    return;
  }

  const confirmed = window.confirm(
    "Supprimer cette carte du board local ? Pense à exporter le JSON si tu veux conserver une version avant suppression.",
  );
  if (!confirmed) {
    return;
  }

  const deletedCardId = cardEditorState.cardId;
  updateBoard((board) => deleteCard(board, deletedCardId), "Carte supprimée du board local.");
  if (cardEditorState.cardId === deletedCardId) {
    resetCardEditor();
  }
  closeCardEditorModal();
}

function handleCardEditorSurfaceChange() {
  syncCardEditorPageOptions("");
}

function handleChecklistCountChange(event) {
  resizeCardEditorChecklist(clampChecklistCount(event.target.value));
}

function handleAddChecklistStep() {
  const nextCount = getCardEditorRawChecklistValues().length + 1;
  resizeCardEditorChecklist(nextCount);
  const inputs = elements.cardEditorChecklistRoot?.querySelectorAll(".card-editor-step__input");
  inputs?.[inputs.length - 1]?.focus();
}

function handleCardEditorChecklistClick(event) {
  const removeButton = event.target.closest('[data-action="remove-editor-step"]');
  if (!removeButton) {
    return;
  }

  const stepRow = removeButton.closest("[data-step-index]");
  if (!stepRow) {
    return;
  }

  const index = Number.parseInt(stepRow.dataset.stepIndex || "-1", 10);
  if (index < 0) {
    return;
  }

  const labels = getCardEditorRawChecklistValues().filter((_, itemIndex) => itemIndex !== index);
  renderCardEditorChecklist(labels);
}

function openCardEditor(cardId = null) {
  if (cardId) {
    const context = findCardContext(store.getState().board, cardId);
    if (!context) {
      updateSaveStatus("Carte introuvable.");
      return;
    }
    closeCardModal();
    populateCardEditor(context);
  } else {
    resetCardEditor();
  }

  openCardEditorModal();
}

function populateCardEditor(context) {
  const { surface, page, card } = context;
  cardEditorState.cardId = card.id;

  if (elements.newCardSurface) {
    elements.newCardSurface.value = surface.id;
  }
  syncCardEditorPageOptions(page.name);

  if (elements.newCardPage) {
    elements.newCardPage.value = page.name;
  }
  if (elements.newCardPageCustom) {
    elements.newCardPageCustom.value = "";
  }
  if (elements.newCardTitle) {
    elements.newCardTitle.value = card.title || "";
  }
  if (elements.newCardScenarioTitle) {
    elements.newCardScenarioTitle.value = card.scenarioTitle || "";
  }
  if (elements.newCardSeverity) {
    elements.newCardSeverity.value = card.severity || "major";
  }
  if (elements.newCardSourceStatus) {
    elements.newCardSourceStatus.value = card.sourceStatus || "source-neutral";
  }
  if (elements.newCardMethod) {
    elements.newCardMethod.value = card.legacyContext?.description || "";
  }
  if (elements.newCardExpectedResult) {
    elements.newCardExpectedResult.value = card.legacyContext?.expectedResult || "";
  }
  if (elements.newCardSourceIssues) {
    elements.newCardSourceIssues.value = (card.sourceIssues || []).join("\n");
  }
  if (elements.newCardValidatedPoints) {
    elements.newCardValidatedPoints.value = (card.validatedPoints || []).join("\n");
  }
  if (elements.newCardAdvice) {
    elements.newCardAdvice.value = (card.advice || []).join("\n");
  }
  if (elements.newCardReferences) {
    elements.newCardReferences.value = (card.references || []).join("\n");
  }
  if (elements.newCardNotes) {
    elements.newCardNotes.value = card.notes || "";
  }

  clearCardEditorValidation();
  renderCardEditorChecklist((card.checklist || []).map((item) => item.label || ""));
  syncCardEditorUi();
}

function resetCardEditor() {
  const state = store.getState();
  if (!state.board) {
    return;
  }
  const preferredSurfaceId = resolvePreferredEditorSurfaceId(state.board, state.filters);
  const preferredPageName = resolvePreferredEditorPageName(
    state.board,
    state.filters,
    preferredSurfaceId,
  );

  cardEditorState.cardId = null;

  if (elements.newCardSurface) {
    elements.newCardSurface.value = preferredSurfaceId;
  }

  syncCardEditorPageOptions(preferredPageName);

  if (elements.newCardPage) {
    elements.newCardPage.value = preferredPageName;
  }
  if (elements.newCardPageCustom) {
    elements.newCardPageCustom.value = "";
  }
  if (elements.newCardTitle) {
    elements.newCardTitle.value = "";
  }
  if (elements.newCardScenarioTitle) {
    elements.newCardScenarioTitle.value = "";
  }
  if (elements.newCardSeverity) {
    elements.newCardSeverity.value = "major";
  }
  if (elements.newCardSourceStatus) {
    elements.newCardSourceStatus.value = "source-neutral";
  }
  if (elements.newCardMethod) {
    elements.newCardMethod.value = "";
  }
  if (elements.newCardExpectedResult) {
    elements.newCardExpectedResult.value = "";
  }
  if (elements.newCardSourceIssues) {
    elements.newCardSourceIssues.value = "";
  }
  if (elements.newCardValidatedPoints) {
    elements.newCardValidatedPoints.value = "";
  }
  if (elements.newCardAdvice) {
    elements.newCardAdvice.value = "";
  }
  if (elements.newCardReferences) {
    elements.newCardReferences.value = "";
  }
  if (elements.newCardNotes) {
    elements.newCardNotes.value = "";
  }

  clearCardEditorValidation();
  renderCardEditorChecklist(["", "", ""]);
  syncCardEditorUi();
}

function readCardEditorPayload(cardId) {
  const surfaceId = String(elements.newCardSurface?.value || "").trim();
  const surfaceName =
    elements.newCardSurface?.selectedOptions?.[0]?.textContent?.trim() || "Cartes perso";
  const selectedPageName = String(elements.newCardPage?.value || "").trim();
  const customPageName = String(elements.newCardPageCustom?.value || "").trim();
  const title = String(elements.newCardTitle?.value || "").trim();
  const scenarioTitle = String(elements.newCardScenarioTitle?.value || "").trim() || title;
  const pageName = customPageName || selectedPageName;

  if (!surfaceId) {
    throw new Error("Sélectionne une surface pour la carte.");
  }

  if (!pageName) {
    throw new Error("Choisis une page existante ou saisis un nom de page.");
  }

  if (!title) {
    throw new Error("Le titre de la carte est obligatoire.");
  }

  return {
    id: cardId,
    surfaceId,
    surfaceName,
    pageName,
    title,
    scenarioTitle,
    severity: elements.newCardSeverity?.value || "major",
    sourceStatus: elements.newCardSourceStatus?.value || "source-neutral",
    testMethod: elements.newCardMethod?.value || "",
    expectedResult: elements.newCardExpectedResult?.value || "",
    sourceIssues: elements.newCardSourceIssues?.value || "",
    validatedPoints: elements.newCardValidatedPoints?.value || "",
    advice: elements.newCardAdvice?.value || "",
    references: elements.newCardReferences?.value || "",
    notes: elements.newCardNotes?.value || "",
    checklistLabels: getCardEditorChecklistValues(),
  };
}

function validateCardEditorRequiredFields() {
  clearCardEditorValidation();

  const checks = [
    {
      label: "Surface",
      fields: [elements.newCardSurface],
      isValid: () => Boolean(String(elements.newCardSurface?.value || "").trim()),
    },
    {
      label: "Page existante ou nouvelle page",
      fields: [elements.newCardPage, elements.newCardPageCustom],
      isValid: () =>
        Boolean(
          String(elements.newCardPage?.value || "").trim()
          || String(elements.newCardPageCustom?.value || "").trim(),
        ),
    },
    {
      label: "Titre de la carte",
      fields: [elements.newCardTitle],
      isValid: () => Boolean(String(elements.newCardTitle?.value || "").trim()),
    },
    {
      label: "Méthode de test / contexte",
      fields: [elements.newCardMethod],
      isValid: () => Boolean(String(elements.newCardMethod?.value || "").trim()),
    },
    {
      label: "Résultat attendu",
      fields: [elements.newCardExpectedResult],
      isValid: () => Boolean(String(elements.newCardExpectedResult?.value || "").trim()),
    },
  ];

  const missing = checks.filter((check) => !check.isValid());
  missing.forEach((check) => {
    check.fields.forEach((field) => setCardEditorFieldInvalid(field, true));
  });

  return {
    isValid: missing.length === 0,
    missingFields: missing.flatMap((check) => check.fields).filter(Boolean),
    missingLabels: missing.map((check) => check.label),
  };
}

function handleCardEditorValidationInteraction(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (!target.closest("#card-editor-panel")) {
    return;
  }

  if (target === elements.newCardPage || target === elements.newCardPageCustom) {
    setCardEditorFieldInvalid(elements.newCardPage, false);
    setCardEditorFieldInvalid(elements.newCardPageCustom, false);
    return;
  }

  setCardEditorFieldInvalid(target, false);
}

function clearCardEditorValidation() {
  [
    elements.newCardSurface,
    elements.newCardPage,
    elements.newCardPageCustom,
    elements.newCardTitle,
    elements.newCardMethod,
    elements.newCardExpectedResult,
  ].forEach((field) => setCardEditorFieldInvalid(field, false));
}

function setCardEditorFieldInvalid(field, isInvalid) {
  if (!field) {
    return;
  }

  field.toggleAttribute("aria-invalid", isInvalid);
  field.closest(".field")?.classList.toggle("is-invalid", isInvalid);
}

function focusFirstInvalidCardEditorField(fields = []) {
  const firstField = fields.find(Boolean);
  firstField?.focus();
}

function buildCardEditorValidationMessage(labels = []) {
  if (!labels.length) {
    return "Complète les champs obligatoires avant d'enregistrer la carte.";
  }

  return [
    "Complète les champs obligatoires avant d'enregistrer la carte :",
    "",
    ...labels.map((label) => `- ${label}`),
  ].join("\n");
}

function syncCardEditorUi() {
  if (!store.getState().board) {
    return;
  }

  let editingContext = null;
  if (cardEditorState.cardId) {
    editingContext = findCardContext(store.getState().board, cardEditorState.cardId);
    if (!editingContext) {
      cardEditorState.cardId = null;
    }
  }

  const isEditing = Boolean(editingContext);
  if (elements.cardEditorTitle) {
    elements.cardEditorTitle.textContent = isEditing ? "Modifier une carte" : "Ajouter une carte";
  }
  if (elements.cardEditorBadge) {
    elements.cardEditorBadge.textContent = isEditing ? "Édition" : "Création";
  }
  if (elements.cardEditorSubtitle) {
    elements.cardEditorSubtitle.textContent = isEditing
      ? `Modification locale de ${editingContext.surface.name} · ${editingContext.page.name}. Exporte le JSON pour publier ces changements sur GitHub.`
      : "Les modifications sont stockées localement. Exporte le JSON pour les publier sur GitHub.";
  }
  if (elements.createCardButton) {
    elements.createCardButton.textContent = isEditing
      ? "Enregistrer les modifications"
      : "Enregistrer la carte";
  }
  if (elements.cancelCardEditorButton) {
    elements.cancelCardEditorButton.textContent = isEditing ? "Nouvelle carte" : "Fermer";
  }
  if (elements.deleteCardEditorButton) {
    elements.deleteCardEditorButton.hidden = !isEditing;
  }
  elements.cardEditorPanel?.classList.toggle("is-editing", isEditing);
}

function syncCardEditorPageOptions(selectedPageName = elements.newCardPage?.value || "") {
  const state = store.getState();
  if (!state.board) {
    return;
  }
  syncSidebarOptions(state.board, elements, state.filters);

  if (!elements.newCardPage) {
    return;
  }

  const pageOptions = Array.from(elements.newCardPage.options).map((option) => option.value);
  elements.newCardPage.value = pageOptions.includes(selectedPageName) ? selectedPageName : "";
}

function resolvePreferredEditorSurfaceId(board, filters) {
  if (filters.surface !== "all" && board.surfaces.some((surface) => surface.id === filters.surface)) {
    return filters.surface;
  }

  const currentEditorSurface = String(elements.newCardSurface?.value || "").trim();
  if (currentEditorSurface && board.surfaces.some((surface) => surface.id === currentEditorSurface)) {
    return currentEditorSurface;
  }

  return board.surfaces[0]?.id || "manager";
}

function resolvePreferredEditorPageName(board, filters, surfaceId) {
  if (filters.page !== "all" && filters.surface === surfaceId) {
    const pageName = findPageNameById(board, surfaceId, filters.page);
    if (pageName) {
      return pageName;
    }
  }

  const currentEditorPage = String(elements.newCardPage?.value || "").trim();
  if (currentEditorPage && hasPageName(board, surfaceId, currentEditorPage)) {
    return currentEditorPage;
  }

  return "";
}

function findPageNameById(board, surfaceId, pageId) {
  const surface = board.surfaces.find((entry) => entry.id === surfaceId);
  const page = surface?.pages.find((entry) => entry.id === pageId);
  return page?.name || "";
}

function hasPageName(board, surfaceId, pageName) {
  const surface = board.surfaces.find((entry) => entry.id === surfaceId);
  return surface?.pages.some((page) => page.name === pageName) || false;
}

function renderCardEditorChecklist(labels = []) {
  if (!elements.cardEditorChecklistRoot) {
    return;
  }

  const root = elements.cardEditorChecklistRoot;
  root.innerHTML = "";

  if (!labels.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "card-editor-step__empty";
    emptyState.textContent = "Aucune étape définie. Ajoute-en pour cadrer le scénario.";
    root.append(emptyState);
  }

  labels.forEach((label, index) => {
    const row = document.createElement("div");
    row.className = "card-editor-step";
    row.dataset.stepIndex = String(index);

    const indexBadge = document.createElement("span");
    indexBadge.className = "card-editor-step__index";
    indexBadge.textContent = `Étape ${index + 1}`;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "card-text-input card-editor-step__input";
    input.placeholder = `Décris l'étape ${index + 1}`;
    input.value = label;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button ghost small card-editor-step__remove";
    removeButton.dataset.action = "remove-editor-step";
    removeButton.textContent = "Retirer";

    row.append(indexBadge, input, removeButton);
    root.append(row);
  });

  if (elements.newCardChecklistCount) {
    elements.newCardChecklistCount.value = String(labels.length);
  }
}

function resizeCardEditorChecklist(nextCount) {
  const safeCount = clampChecklistCount(nextCount);
  const currentValues = getCardEditorRawChecklistValues();
  const labels = Array.from({ length: safeCount }, (_, index) => currentValues[index] || "");
  renderCardEditorChecklist(labels);
}

function getCardEditorValuesFromDom() {
  return Array.from(
    elements.cardEditorChecklistRoot?.querySelectorAll(".card-editor-step__input") || [],
  );
}

function getCardEditorRawChecklistValues() {
  return getCardEditorValuesFromDom().map((input) => input.value || "");
}

function getCardEditorChecklistValues() {
  return getCardEditorRawChecklistValues()
    .map((value) => value.trim())
    .filter(Boolean);
}

function clampChecklistCount(value) {
  const parsed = Number.parseInt(String(value || "0"), 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(20, parsed));
}

function scrollCardEditorIntoView() {
  window.requestAnimationFrame(() => {
    elements.newCardTitle?.focus({ preventScroll: true });
  });
}

function openCardEditorModal() {
  elements.cardEditorOverlay?.classList.add("active");
  syncBodyScrollLock();
  scrollCardEditorIntoView();
}

function closeCardEditorModal() {
  elements.cardEditorOverlay?.classList.remove("active");
  syncBodyScrollLock();
}

function handleExportJson() {
  const board = store.getState().board;
  downloadBlob(
    new Blob([JSON.stringify(buildExportPayload(board), null, 2)], {
      type: "application/json",
    }),
    `qaredata-qa-board-${formatFileStamp(new Date())}.json`,
  );
  updateSaveStatus("Export JSON généré.");
}

async function handleImportJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const payload = await readJsonFile(file);
    const board = collapseAllCards(parseImportedBoard(payload));
    store.setState((current) => ({
      ...current,
      board,
    }));
    saveCards(board);
    closeCardModal();
    closeCardEditorModal();
    render();
    resetCardEditor();
    updateSaveStatus("Import JSON terminé.");
  } catch (error) {
    console.error(error);
    updateSaveStatus("Import impossible : fichier non valide.");
  } finally {
    event.target.value = "";
  }
}

function handleGenerateMarkdown() {
  downloadMarkdownReport(store.getState().board);
  updateSaveStatus("Rapport Markdown généré.");
}

async function handleGeneratePdf() {
  elements.generatePdfButton.disabled = true;
  updateSaveStatus("Génération du PDF en cours…");

  try {
    const result = await generatePdfReport(store.getState().board);
    updateSaveStatus(
      result?.mode === "print"
        ? "Rapport prêt en mode impression PDF."
        : "Rapport PDF téléchargé.",
    );
  } catch (error) {
    console.error(error);
    updateSaveStatus("Impossible de générer le PDF.");
  } finally {
    elements.generatePdfButton.disabled = false;
  }
}

async function handleReset() {
  const confirmed = window.confirm("Réinitialiser la sauvegarde locale et revenir à la base JSON ?");
  if (!confirmed) {
    return;
  }

  clearSavedCards();
  const board = collapseAllCards(await loadCards());
  store.setState(createInitialAppState(board));
  saveCards(board);
  closeCardModal();
  closeCardEditorModal();
  render();
  resetCardEditor();
  updateSaveStatus("Sauvegarde locale réinitialisée.");
}

function handleRandomTestRun() {
  if (!store.getState().board) {
    updateSaveStatus("Le board n'est pas encore prêt pour la simulation.");
    return;
  }

  const simulationSettings = askRandomQaSimulationSettings(store.getState().board, {
    tester: elements.testerInput?.value,
    environment: elements.environmentInput?.value,
  });
  if (!simulationSettings) {
    updateSaveStatus("Simulation QA annulée.");
    return;
  }

  try {
    const simulationResult = runRandomQaSimulation(
      store.getState().board,
      simulationSettings,
    );

    updateBoard(
      () => simulationResult.board,
      simulationResult.summary?.message || "Simulation QA exécutée.",
    );
  } catch (error) {
    console.error(error);
    updateSaveStatus("La simulation QA a échoué.");
  }
}

function maybeRunTestMode() {
  if (!isTestModeRoute()) {
    return;
  }

  window.setTimeout(() => {
    handleRandomTestRun();
  }, 80);
}

function handleBoardClick(event) {
  const card = event.target.closest(".qa-card");
  if (!card) return;

  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    // C'est un bouton d'action
    const cardId = getCardIdFromNode(actionTarget);
    if (!cardId) return;

    switch (actionTarget.dataset.action) {
      case "open-card-modal": {
        openCardModal(cardId);
        break;
      }

      case "edit-card-definition": {
        openCardEditor(cardId);
        break;
      }

      case "add-scenario-step": {
        const cardEl = actionTarget.closest(".qa-card");
        const input = cardEl?.querySelector(".new-scenario-step-input");
        const label = input?.value || "";
        if (!label.trim()) {
          updateSaveStatus("Saisis une étape utilisateur avant de l'ajouter.");
          input?.focus();
          break;
        }
        updateBoard(
          (board) => addScenarioStep(board, cardId, label),
          "Étape ajoutée.",
        );
        if (input) {
          input.value = "";
        }
        break;
      }

      case "remove-scenario-step": {
        const scenarioRow = actionTarget.closest("[data-step-id]");
        if (!scenarioRow) return;
        updateBoard(
          (board) => removeScenarioStep(board, cardId, scenarioRow.dataset.stepId),
          "Étape supprimée.",
        );
        break;
      }

      case "mark-step-ok": {
        const scenarioRow = actionTarget.closest("[data-step-id]");
        if (!scenarioRow) return;
        if (scenarioRow.dataset.stepStatus === "ok") {
          updateBoard(
            (board) =>
              clearScenarioStepResult(
                board,
                cardId,
                scenarioRow.dataset.stepId,
              ),
            "Étape remise à tester.",
          );
          break;
        }
        updateBoard(
          (board) =>
            markScenarioStepOk(
              board,
              cardId,
              scenarioRow.dataset.stepId,
              resolveTesterName(cardId),
            ),
          "Étape validée.",
        );
        break;
      }

      case "mark-step-ko": {
        const scenarioRow = actionTarget.closest("[data-step-id]");
        if (!scenarioRow) return;
        if (scenarioRow.dataset.stepStatus === "ko") {
          updateBoard(
            (board) =>
              clearScenarioStepResult(
                board,
                cardId,
                scenarioRow.dataset.stepId,
              ),
            "Étape remise à tester.",
          );
          break;
        }

        if (scenarioRow.classList.contains("is-bug-open")) {
          closeScenarioBugForm(scenarioRow);
          break;
        }

        openScenarioBugForm(scenarioRow);
        break;
      }

      case "cancel-step-ko": {
        const scenarioRow = actionTarget.closest("[data-step-id]");
        if (!scenarioRow) return;
        closeScenarioBugForm(scenarioRow);
        break;
      }

      case "save-step-bug": {
        const scenarioRow = actionTarget.closest("[data-step-id]");
        if (!scenarioRow) return;

        const bugPayload = readScenarioBugPayload(scenarioRow);
        if (!hasCompleteBugPayload(bugPayload)) {
          scenarioRow.classList.add("is-bug-open", "is-bug-invalid");
          scenarioRow.querySelectorAll(".qa-step__bug-input").forEach((input) => {
            if (!input.value.trim()) {
              input.setAttribute("aria-invalid", "true");
            }
          });
          updateSaveStatus("Complète la description du bug et le comportement observé.");
          return;
        }

        updateBoard(
          (board) =>
            saveScenarioStepBug(
              board,
              cardId,
              scenarioRow.dataset.stepId,
              bugPayload,
              resolveTesterName(cardId),
            ),
          "Bug enregistré sur l'étape.",
        );
        break;
      }

      case "remove-screenshot": {
        const shot = actionTarget.closest("[data-screenshot-id]");
        if (!shot) return;
        updateBoard(
          (board) => removeScreenshot(board, cardId, shot.dataset.screenshotId),
          "Screenshot supprimé.",
        );
        break;
      }

      case "delete-card": {
        const confirmed = window.confirm(
          "Supprimer cette carte du board local ? Exporte le JSON si tu veux conserver une sauvegarde publiable.",
        );
        if (!confirmed) return;
        updateBoard((board) => deleteCard(board, cardId), "Carte supprimée.");
        if (cardEditorState.cardId === cardId) {
          resetCardEditor();
        }
        closeCardModal();
        break;
      }
    }
    return;
  }

  if (card.closest("#board-root")) {
    openCardModal(card.dataset.cardId);
  }
}

function handleBoardChange(event) {
  const cardId = getCardIdFromNode(event.target);
  if (!cardId) {
    return;
  }

  if (event.target.classList.contains("qa-step__bug-input")) {
    return;
  }

  if (event.target.classList.contains("card-select")) {
    updateBoard(
      (board) =>
        setCardField(
          board,
          cardId,
          event.target.dataset.field,
          event.target.value,
        ),
      "Carte mise à jour.",
    );
    return;
  }

  if (event.target.classList.contains("card-text-input")
    || event.target.classList.contains("card-textarea")) {
    render();
    updateSaveStatus("Carte mise à jour.");
    return;
  }

  if (event.target.classList.contains("screenshot-input")) {
    void importScreenshots(cardId, event.target.files);
    event.target.value = "";
  }
}

function handleBoardInput(event) {
  const cardId = getCardIdFromNode(event.target);
  if (!cardId) {
    return;
  }

  const scenarioRow = event.target.closest("[data-step-id]");
  if (scenarioRow && event.target.classList.contains("qa-step__bug-input")) {
    scenarioRow.classList.remove("is-bug-invalid");
    if (event.target.value.trim()) {
      event.target.removeAttribute("aria-invalid");
    }
    return;
  }

  if (
    event.target.classList.contains("card-text-input")
    || event.target.classList.contains("card-textarea")
  ) {
    updateBoard(
      (board) =>
        setCardField(
          board,
          cardId,
          event.target.dataset.field,
          event.target.value,
        ),
      "Carte enregistrée.",
      false,
      false,
    );
  }
}

function handleBoardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (event.target.closest("button, input, select, textarea")) {
    return;
  }

  const card = event.target.closest(".qa-card");
  if (!card || !card.closest("#board-root")) {
    return;
  }

  event.preventDefault();
  openCardModal(card.dataset.cardId);
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (elements.cardEditorOverlay?.classList.contains("active")) {
    closeCardEditorModal();
    return;
  }

  if (elements.modalOverlay?.classList.contains("active")) {
    closeCardModal();
  }
}

function handleBoardDragOver(event) {
  const dropzone = event.target.closest("[data-dropzone]");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  dropzone.classList.add("is-dragover");
}

function handleBoardDragLeave(event) {
  const dropzone = event.target.closest("[data-dropzone]");
  if (!dropzone) {
    return;
  }

  if (dropzone.contains(event.relatedTarget)) {
    return;
  }
  dropzone.classList.remove("is-dragover");
}

function handleBoardDrop(event) {
  const dropzone = event.target.closest("[data-dropzone]");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  dropzone.classList.remove("is-dragover");

  const cardId = getCardIdFromNode(dropzone);
  if (!cardId) {
    return;
  }

  void importScreenshots(cardId, event.dataTransfer?.files);
}

async function importScreenshots(cardId, files) {
  const pickedFiles = Array.from(files || []).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (!pickedFiles.length) {
    updateSaveStatus("Aucune image exploitable à importer.");
    return;
  }

  try {
    const screenshots = await Promise.all(
      pickedFiles.map((file) => handleImageUpload(file)),
    );

    updateBoard(
      (board) =>
        screenshots.reduce(
          (nextBoard, shot) => addScreenshot(nextBoard, cardId, shot),
          board,
        ),
      "Screenshot(s) ajouté(s).",
    );
  } catch (error) {
    console.error(error);
    updateSaveStatus("Impossible d’importer les screenshots.");
  }
}

async function handleImageUpload(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const optimizedDataUrl = await optimizeImage(dataUrl, file.type);
  return {
    id: generateId("shot"),
    name: file.name,
    dataUrl: optimizedDataUrl,
    createdAt: new Date().toISOString(),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Lecture image impossible"));
    reader.readAsDataURL(file);
  });
}

function optimizeImage(dataUrl, mimeType) {
  if (mimeType === "image/svg+xml") {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1440;
      const maxHeight = 1080;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.round(image.width * ratio);
      const height = Math.round(image.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => reject(new Error("Optimisation image impossible"));
    image.src = dataUrl;
  });
}

function updateBoard(updater, message, shouldRender = true, syncActiveModal = true) {
  const nextState = store.setState((current) => {
    const nextBoard = updater(current.board);
    saveCards(nextBoard);
    return {
      ...current,
      board: nextBoard,
    };
  });

  if (shouldRender) {
    render();
  }

  if (syncActiveModal && activeModalCardId) {
    if (findCardContext(store.getState().board, activeModalCardId)) {
      renderModalCard(activeModalCardId);
    } else {
      closeCardModal();
    }
  }

  updateSaveStatus(message);
  return nextState;
}

function syncStaticFields(state) {
  if (document.activeElement !== elements.projectInput) {
    elements.projectInput.value = state.board.meta.projectName || "";
  }
  if (document.activeElement !== elements.testerInput) {
    elements.testerInput.value = state.board.meta.tester || "";
  }
  if (document.activeElement !== elements.environmentInput) {
    elements.environmentInput.value = state.board.meta.environment || "";
  }

  if (elements.headerProjectTitle) {
    elements.headerProjectTitle.textContent =
      state.board.meta.projectName?.trim() || "QareData QA Board";
  }

  if (elements.headerProjectSubtitle) {
    elements.headerProjectSubtitle.textContent = buildHeaderSubtitle(state.board.meta);
  }
}

function buildHeaderSubtitle(meta) {
  const tester = meta.tester?.trim();
  const environment = meta.environment?.trim();

  if (tester && environment) {
    return `Pilotage de recette par ${tester} sur ${environment}.`;
  }

  if (tester) {
    return `Pilotage de recette suivi par ${tester}.`;
  }

  if (environment) {
    return `Campagne active sur ${environment}.`;
  }

  return "Vue d'ensemble des campagnes de recette, criticités et exports.";
}

function initTheme() {
  const isDark = localStorage.getItem("theme") === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  syncThemeState(isDark);
}

function handleThemeToggle() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  syncThemeState(isDark);
}

function syncThemeState(isDark) {
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  if (elements.themeIcon) {
    elements.themeIcon.textContent = isDark ? "☀" : "☾";
  }
  if (elements.themeButton) {
    const label = isDark ? "Activer le mode clair" : "Activer le mode sombre";
    elements.themeButton.setAttribute("title", label);
    elements.themeButton.setAttribute("aria-label", label);
    elements.themeButton.setAttribute("aria-pressed", isDark ? "true" : "false");
  }
}

function initSidebarState() {
  const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
}

function isTestModeRoute() {
  const path = String(window.location.pathname || "").replace(/\/+$/, "");
  return /\/test(?:\/index\.html)?$/.test(path);
}

function toggleSidebarCollapsed() {
  const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  render();
}

function handleSidebarNavigationClick(event) {
  const toggleButton = event.target.closest("#sidebar-toggle");
  if (toggleButton) {
    toggleSidebarCollapsed();
    return;
  }

  const navButton = event.target.closest("[data-nav-surface]");
  if (!navButton) {
    return;
  }

  updateFilters({
    surface: navButton.dataset.navSurface || "all",
    page: navButton.dataset.navPage || "all",
  });
}

function findCardContext(board, cardId) {
  for (const surface of board.surfaces) {
    for (const page of surface.pages) {
      for (const card of page.cards) {
        if (card.id === cardId) {
          return { surface, page, card };
        }
      }
    }
  }

  return null;
}

function openCardModal(cardId) {
  const context = findCardContext(store.getState().board, cardId);
  if (!context || !elements.modalOverlay || !elements.modalContent) {
    return;
  }

  activeModalCardId = cardId;
  renderModalCard(cardId);
  elements.modalOverlay.classList.add("active");
  syncBodyScrollLock();
}

function renderModalCard(cardId) {
  const context = findCardContext(store.getState().board, cardId);
  if (!context || !elements.modalContent) {
    return;
  }

  const previousScrollTop = elements.modalContent.scrollTop;
  elements.modalContent.innerHTML = renderCardDetailed(
    context.surface,
    context.page,
    context.card,
    store.getState().board.meta,
  );
  elements.modalContent.scrollTop = previousScrollTop;
}

function closeCardModal() {
  activeModalCardId = null;
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.remove("active");
  }
  if (elements.modalContent) {
    elements.modalContent.innerHTML = "";
  }
  syncBodyScrollLock();
}

function syncBodyScrollLock() {
  const hasOpenOverlay = Boolean(
    elements.modalOverlay?.classList.contains("active")
    || elements.cardEditorOverlay?.classList.contains("active"),
  );
  document.body.style.overflow = hasOpenOverlay ? "hidden" : "";
}

function getCardIdFromNode(node) {
  const card = node.closest(".qa-card");
  return card?.dataset.cardId || null;
}

function resolveTesterName(cardId) {
  const context = findCardContext(store.getState().board, cardId);
  return context?.card.tester || store.getState().board.meta.tester || "";
}

function readScenarioBugPayload(stepRow) {
  const defaultExpectedResult = stepRow.querySelector(".qa-step__bug-form")?.dataset.defaultExpectedResult
    || "Le scénario doit être cohérent, stable et exploitable sans blocage majeur.";

  return {
    description:
      stepRow.querySelector(".qa-step__bug-description")?.value || "",
    observedBehavior:
      stepRow.querySelector(".qa-step__bug-observed")?.value || "",
    expectedResult: defaultExpectedResult,
  };
}

function hasCompleteBugPayload(payload) {
  return Boolean(
    payload.description.trim()
    && payload.observedBehavior.trim()
    && payload.expectedResult.trim(),
  );
}

function openScenarioBugForm(stepRow) {
  stepRow.classList.remove("is-ok", "is-bug-invalid");
  stepRow.classList.add("is-bug-open");
  stepRow.querySelectorAll(".qa-step__bug-input").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
  stepRow.querySelector(".qa-step__bug-description")?.focus();
}

function closeScenarioBugForm(stepRow) {
  stepRow.classList.remove("is-bug-open", "is-bug-invalid");
  stepRow.querySelectorAll(".qa-step__bug-input").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });

  if (stepRow.dataset.stepStatus === "ok") {
    stepRow.classList.add("is-ok");
  }
}

function updateSaveStatus(message) {
  const now = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const compactMessage = message.replace(/\.$/, "");
  elements.saveStatus.textContent = `${compactMessage} · ${now}`;
}

function getElements() {
  return {
    saveStatus: document.querySelector("#save-status"),
    summaryRoot: document.querySelector("#summary-root"),
    sidebarNavRoot: document.querySelector("#sidebar-nav-root"),
    sidebarRoot: document.querySelector("#sidebar-nav-root"),
    boardRoot: document.querySelector("#board-root"),

    projectInput: document.querySelector("#project-name"),
    testerInput: document.querySelector("#tester-name"),
    environmentInput: document.querySelector("#environment-name"),
    headerProjectTitle: document.querySelector("#header-project-title"),
    headerProjectSubtitle: document.querySelector("#header-project-subtitle"),

    searchInput: document.querySelector("#search-input"),
    surfaceFilter: document.querySelector("#surface-filter"),
    pageFilter: document.querySelector("#page-filter"),
    statusFilter: document.querySelector("#status-filter"),
    severityFilter: document.querySelector("#severity-filter"),
    onlyNotValidatedInput: document.querySelector("#only-not-validated"),
    hideDoneInput: document.querySelector("#hide-done"),

    openCardEditorButton: document.querySelector("#open-card-editor"),
    cardEditorPanel: document.querySelector("#card-editor-panel"),
    cardEditorOverlay: document.querySelector("#card-editor-overlay"),
    cardEditorClose: document.querySelector("#card-editor-close"),
    cardEditorTitle: document.querySelector("#card-editor-title"),
    cardEditorSubtitle: document.querySelector("#card-editor-subtitle"),
    cardEditorBadge: document.querySelector("#card-editor-badge"),
    newCardSurface: document.querySelector("#new-card-surface"),
    newCardPage: document.querySelector("#new-card-page"),
    newCardPageCustom: document.querySelector("#new-card-page-custom"),
    newCardTitle: document.querySelector("#new-card-title"),
    newCardScenarioTitle: document.querySelector("#new-card-scenario-title"),
    newCardSeverity: document.querySelector("#new-card-severity"),
    newCardSourceStatus: document.querySelector("#new-card-source-status"),
    newCardMethod: document.querySelector("#new-card-method"),
    newCardExpectedResult: document.querySelector("#new-card-expected-result"),
    newCardSourceIssues: document.querySelector("#new-card-source-issues"),
    newCardValidatedPoints: document.querySelector("#new-card-validated-points"),
    newCardAdvice: document.querySelector("#new-card-advice"),
    newCardReferences: document.querySelector("#new-card-references"),
    newCardNotes: document.querySelector("#new-card-notes"),
    newCardChecklistCount: document.querySelector("#new-card-checklist-count"),
    addChecklistStepButton: document.querySelector("#add-checklist-step"),
    cardEditorChecklistRoot: document.querySelector("#card-editor-checklist-root"),
    createCardButton: document.querySelector("#create-card"),
    cancelCardEditorButton: document.querySelector("#cancel-card-editor"),
    deleteCardEditorButton: document.querySelector("#delete-card-editor"),

    generateMarkdownButton: document.querySelector("#generate-markdown"),
    generatePdfButton: document.querySelector("#generate-pdf"),
    exportButton: document.querySelector("#export-json"),
    importInput: document.querySelector("#file-import"),
    importButton: document.querySelector("#import-json"),
    resetButton: document.querySelector("#reset-board"),
    themeButton: document.querySelector("#btn-theme"),
    themeIcon: document.querySelector("#theme-icon"),
    modalOverlay: document.querySelector("#modal-overlay"),
    modalContent: document.querySelector("#modal-content"),
    modalClose: document.querySelector("#modal-close"),
  };
}
