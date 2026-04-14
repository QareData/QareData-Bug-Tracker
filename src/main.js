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
import { createCardCountAnimationController } from "./app/card-count-animation.js";
import { createThemeController } from "./app/theme-controller.js";
import { createSidebarController } from "./app/sidebar-controller.js";
import { createCardEditorController } from "./app/card-editor-controller.js";
import { readFileAsDataUrl, optimizeImage } from "./app/image-utils.js";
import { findCardContext } from "./app/card-context.js";
import { createModalController } from "./app/modal-controller.js";
import { createBoardInteractionsController } from "./app/board-interactions-controller.js";

const elements = getElements();
const isCardCountAnimationPage = isCardCountAnimationEnabledPage();
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
const cardCountAnimationController = isCardCountAnimationPage
  ? createCardCountAnimationController({
    root: document.body,
  })
  : createNoopCardCountAnimationController();
const sidebarController = createSidebarController({
  updateFilters,
  render,
});
const modalController = createModalController({
  elements,
  store,
  findCardContext,
  renderCardDetailed,
});
const cardEditorController = createCardEditorController({
  elements,
  store,
  syncSidebarOptions,
  findCardContext,
  updateBoard,
  updateSaveStatus,
  closeCardModal: modalController.closeCardModal,
  syncBodyScrollLock: modalController.syncBodyScrollLock,
  generateId,
  upsertCardDefinition,
  deleteCard,
});
const boardInteractionsController = createBoardInteractionsController({
  elements,
  store,
  render,
  findCardContext,
  cardEditorController,
  updateBoard,
  updateSaveStatus,
  playCardCountAnimation: cardCountAnimationController.playCardCountAnimation,
  cardCountAnimationEnabled: isCardCountAnimationPage,
  openCardModal: modalController.openCardModal,
  closeCardModal: modalController.closeCardModal,
  addScenarioStep,
  removeScenarioStep,
  clearScenarioStepResult,
  markScenarioStepOk,
  saveScenarioStepBug,
  removeScreenshot,
  deleteCard,
  setCardField,
  addScreenshot,
  generateId,
  readFileAsDataUrl,
  optimizeImage,
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

  elements.modalClose?.addEventListener("click", modalController.closeCardModal);
  elements.modalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.modalOverlay) {
      modalController.closeCardModal();
    }
  });
  elements.cardEditorClose?.addEventListener("click", cardEditorController.closeCardEditorModal);
  elements.cardEditorOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.cardEditorOverlay) {
      cardEditorController.closeCardEditorModal();
    }
  });
  document.addEventListener("keydown", boardInteractionsController.handleDocumentKeydown);

  elements.boardRoot.addEventListener("click", boardInteractionsController.handleBoardClick);
  elements.boardRoot.addEventListener("keydown", boardInteractionsController.handleBoardKeydown);
  elements.boardRoot.addEventListener("change", boardInteractionsController.handleBoardChange);
  elements.boardRoot.addEventListener("input", boardInteractionsController.handleBoardInput);
  elements.boardRoot.addEventListener("dragover", boardInteractionsController.handleBoardDragOver);
  elements.boardRoot.addEventListener("dragleave", boardInteractionsController.handleBoardDragLeave);
  elements.boardRoot.addEventListener("drop", boardInteractionsController.handleBoardDrop);

  elements.modalContent?.addEventListener("click", boardInteractionsController.handleBoardClick);
  elements.modalContent?.addEventListener("change", boardInteractionsController.handleBoardChange);
  elements.modalContent?.addEventListener("input", boardInteractionsController.handleBoardInput);
  elements.modalContent?.addEventListener("dragover", boardInteractionsController.handleBoardDragOver);
  elements.modalContent?.addEventListener("dragleave", boardInteractionsController.handleBoardDragLeave);
  elements.modalContent?.addEventListener("drop", boardInteractionsController.handleBoardDrop);
}

function render() {
  const state = store.getState();
  syncSidebarOptions(state.board, elements, state.filters);
  syncStaticFields(state);
  renderApp(state, elements);
  cardCountAnimationController.syncCardCountAnimation(getBoardCardCount(state.board));
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
    modalController.closeCardModal();
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
  modalController.closeCardModal();
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

  const activeModalCardId = modalController.getActiveModalCardId();
  if (syncActiveModal && activeModalCardId) {
    if (findCardContext(store.getState().board, activeModalCardId)) {
      modalController.renderModalCard(activeModalCardId);
    } else {
      modalController.closeCardModal();
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

function updateSaveStatus(message) {
  const now = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const compactMessage = message.replace(/\.$/, "");
  elements.saveStatus.textContent = `${compactMessage} · ${now}`;
}

function getBoardCardCount(board) {
  return (
    board?.surfaces?.reduce(
      (total, surface) =>
        total + surface.pages.reduce((pageTotal, page) => pageTotal + page.cards.length, 0),
      0,
    ) || 0
  );
}

function isCardCountAnimationEnabledPage() {
  const pathname = window.location.pathname.toLowerCase();
  return pathname.endsWith("/index.html") || pathname.includes("/test/");
}

function createNoopCardCountAnimationController() {
  return {
    playCardCountAnimation() {
      return false;
    },
    syncCardCountAnimation() {
      return false;
    },
  };
}
