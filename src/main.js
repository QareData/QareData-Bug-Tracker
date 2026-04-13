import { buildExportPayload, clearSavedCards, loadCards, parseImportedBoard, saveCards } from "./core/dataLoader.js";
import { createStore } from "./core/store.js";
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
} from "./core/state.js";
import { generatePdfReport } from "./services/pdf.service.js";
import { downloadMarkdownReport } from "./services/report.service.js";
import {
  askRandomQaSimulationSettings,
  runRandomQaSimulation,
} from "./services/test-simulator.service.js";
import { renderApp } from "./ui/render.js";
import { renderCardDetailed } from "./ui/components/card-detailed.js";
import { syncSidebarOptions } from "./ui/components/filters.js";
import { downloadBlob, formatFileStamp, readJsonFile, generateId } from "./utils/format.js";
import { getElements } from "./app/dom-elements.js";
import { createThemeController } from "./app/theme-controller.js";
import { createSidebarController } from "./app/sidebar-controller.js";
import { createCardEditorController } from "./app/card-editor-controller.js";
import { readFileAsDataUrl, optimizeImage } from "./app/image-utils.js";
import { findCardContext } from "./app/card-context.js";

const elements = getElements();
let activeModalCardId = null;
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

const themeController = createThemeController({ elements });
const sidebarController = createSidebarController({
  updateFilters,
  render,
});
const cardEditorController = createCardEditorController({
  elements,
  store,
  syncSidebarOptions,
  findCardContext,
  updateBoard,
  updateSaveStatus,
  closeCardModal,
  syncBodyScrollLock,
  generateId,
  upsertCardDefinition,
  deleteCard,
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
  themeController.initTheme();
  sidebarController.initSidebarState();
  const board = collapseAllCards(await loadCards());
  store.setState(createInitialAppState(board));
  saveCards(board);
  bindEvents();
  render();
  cardEditorController.resetCardEditor();
  updateSaveStatus("Board QA chargé. Sauvegarde locale active.");
  maybeRunTestMode();
}

function bindEvents() {
  [elements.projectInput, elements.testerInput, elements.environmentInput].forEach((input) => {
    input.addEventListener("input", handleMetaInput);
    input.addEventListener("change", handleMetaChange);
  });

  elements.openCardEditorButton?.addEventListener("click", () => cardEditorController.openCardEditor());
  elements.createCardButton?.addEventListener("click", cardEditorController.handleCreateCard);
  elements.cancelCardEditorButton?.addEventListener("click", cardEditorController.handleCancelCardEditor);
  elements.deleteCardEditorButton?.addEventListener("click", cardEditorController.handleDeleteEditorCard);
  elements.newCardSurface?.addEventListener("change", cardEditorController.handleCardEditorSurfaceChange);
  elements.cardEditorPanel?.addEventListener("input", cardEditorController.handleCardEditorValidationInteraction);
  elements.cardEditorPanel?.addEventListener("change", cardEditorController.handleCardEditorValidationInteraction);
  elements.newCardChecklistCount?.addEventListener("change", cardEditorController.handleChecklistCountChange);
  elements.addChecklistStepButton?.addEventListener("click", cardEditorController.handleAddChecklistStep);
  elements.cardEditorChecklistRoot?.addEventListener("click", cardEditorController.handleCardEditorChecklistClick);
  elements.exportButton?.addEventListener("click", handleExportJson);
  elements.importButton?.addEventListener("click", () => elements.importInput?.click());
  elements.importInput?.addEventListener("change", handleImportJson);
  elements.generateMarkdownButton.addEventListener("click", handleGenerateMarkdown);
  elements.generatePdfButton.addEventListener("click", handleGeneratePdf);
  elements.resetButton.addEventListener("click", handleReset);
  elements.themeButton?.addEventListener("click", themeController.handleThemeToggle);
  elements.sidebarRoot?.addEventListener("click", sidebarController.handleSidebarNavigationClick);

  elements.modalClose?.addEventListener("click", closeCardModal);
  elements.modalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.modalOverlay) {
      closeCardModal();
    }
  });
  elements.cardEditorClose?.addEventListener("click", cardEditorController.closeCardEditorModal);
  elements.cardEditorOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.cardEditorOverlay) {
      cardEditorController.closeCardEditorModal();
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
  cardEditorController.syncCardEditorUi();
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
    cardEditorController.closeCardEditorModal();
    render();
    cardEditorController.resetCardEditor();
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
  cardEditorController.closeCardEditorModal();
  render();
  cardEditorController.resetCardEditor();
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
  if (!sidebarController.isTestModeRoute()) {
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
        cardEditorController.openCardEditor(cardId);
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
        cardEditorController.clearEditingCardIfMatches(cardId);
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
    cardEditorController.closeCardEditorModal();
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

