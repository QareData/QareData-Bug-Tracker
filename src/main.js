import { buildExportPayload, clearSavedCards, loadCards, parseImportedBoard, saveCards } from "./core/dataLoader.js?v=20260407-pdf-phase1-1";
import { createStore } from "./core/store.js?v=20260407-pdf-phase1-1";
import {
  collapseAllCards,
  addScenarioStep,
  addScreenshot,
  clearScenarioStepResult,
  createInitialAppState,
  createManualCard,
  deleteCard,
  markScenarioStepOk,
  removeScenarioStep,
  removeScreenshot,
  saveScenarioStepBug,
  setCardField,
  updateBoardMeta,
} from "./core/state.js?v=20260407-pdf-phase1-1";
import { generatePdfReport } from "./services/pdf.service.js?v=20260407-pdf-phase1-1";
import { downloadMarkdownReport } from "./services/report.service.js?v=20260407-pdf-phase1-1";
import {
  askRandomQaSimulationSettings,
  runRandomQaSimulation,
} from "./services/test-simulator.service.js?v=20260409-test-simulator-2";
import { renderApp } from "./ui/render.js?v=20260407-pdf-phase1-1";
import { renderCardDetailed } from "./ui/components/card-detailed.js?v=20260407-pdf-phase1-1";
import { syncSidebarOptions } from "./ui/components/filters.js?v=20260407-pdf-phase1-1";
import { downloadBlob, formatFileStamp, readJsonFile, generateId } from "./utils/format.js?v=20260407-pdf-phase1-1";

const elements = getElements();
let activeModalCardId = null;
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
  updateSaveStatus("Board QA chargé. Sauvegarde locale active.");
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

  elements.createCardButton.addEventListener("click", handleCreateCard);
  elements.exportButton?.addEventListener("click", handleExportJson);
  elements.importButton?.addEventListener("click", () => elements.importInput?.click());
  elements.importInput?.addEventListener("change", handleImportJson);
  elements.generateMarkdownButton.addEventListener("click", handleGenerateMarkdown);
  elements.generatePdfButton.addEventListener("click", handleGeneratePdf);
  elements.randomTestButton?.addEventListener("click", handleRandomTestRun);
  elements.resetButton.addEventListener("click", handleReset);
  elements.themeButton?.addEventListener("click", handleThemeToggle);
  elements.sidebarRoot?.addEventListener("click", handleSidebarNavigationClick);

  elements.modalClose?.addEventListener("click", closeCardModal);
  elements.modalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.modalOverlay) {
      closeCardModal();
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
  try {
    updateBoard(
      (board) =>
        createManualCard(board, {
          surfaceId: elements.newCardSurface.value,
          surfaceName:
            elements.newCardSurface.selectedOptions[0]?.textContent || "Cartes perso",
          pageName: elements.newCardPage.value,
          title: elements.newCardTitle.value,
          severity: elements.newCardSeverity.value,
          notes: elements.newCardNotes.value,
          scenarioSteps: elements.newCardChecklist.value,
        }),
      "Carte QA créée.",
    );
  } catch (error) {
    updateSaveStatus(error.message);
    elements.newCardTitle.focus();
    return;
  }

  elements.newCardPage.value = "";
  elements.newCardTitle.value = "";
  elements.newCardNotes.value = "";
  elements.newCardChecklist.value = "";
  elements.newCardSeverity.value = "major";
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
    render();
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
  render();
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
        const confirmed = window.confirm("Supprimer définitivement cette carte manuelle ?");
        if (!confirmed) return;
        updateBoard((board) => deleteCard(board, cardId), "Carte supprimée.");
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
  if (event.key === "Escape" && elements.modalOverlay?.classList.contains("active")) {
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
  document.body.style.overflow = "hidden";
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
  document.body.style.overflow = "";
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

    newCardSurface: document.querySelector("#new-card-surface"),
    newCardPage: document.querySelector("#new-card-page"),
    newCardTitle: document.querySelector("#new-card-title"),
    newCardSeverity: document.querySelector("#new-card-severity"),
    newCardChecklist: document.querySelector("#new-card-checklist"),
    newCardNotes: document.querySelector("#new-card-notes"),
    createCardButton: document.querySelector("#create-card"),

    generateMarkdownButton: document.querySelector("#generate-markdown"),
    generatePdfButton: document.querySelector("#generate-pdf"),
    randomTestButton: document.querySelector("#run-random-test"),
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
