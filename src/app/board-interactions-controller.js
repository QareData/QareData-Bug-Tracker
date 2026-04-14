export function createBoardInteractionsController({
  elements,
  store,
  render,
  findCardContext,
  cardEditorController,
  updateBoard,
  updateSaveStatus,
  playCardCountAnimation,
  cardCountAnimationEnabled = true,
  openCardModal,
  closeCardModal,
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
}) {
  function handleBoardClick(event) {
    const card = event.target.closest(".qa-card");
    if (!card) {
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      const cardId = getCardIdFromNode(actionTarget);
      if (!cardId) {
        return;
      }

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
            updateSaveStatus("Saisis une etape utilisateur avant de l'ajouter.");
            input?.focus();
            break;
          }
          updateBoard(
            (board) => addScenarioStep(board, cardId, label),
            "Etape ajoutee.",
          );
          if (input) {
            input.value = "";
          }
          break;
        }

        case "remove-scenario-step": {
          const scenarioRow = actionTarget.closest("[data-step-id]");
          if (!scenarioRow) {
            return;
          }
          updateBoard(
            (board) => removeScenarioStep(board, cardId, scenarioRow.dataset.stepId),
            "Etape supprimee.",
          );
          break;
        }

        case "mark-step-ok": {
          const scenarioRow = actionTarget.closest("[data-step-id]");
          if (!scenarioRow) {
            return;
          }
          if (scenarioRow.dataset.stepStatus === "ok") {
            updateBoard(
              (board) => clearScenarioStepResult(board, cardId, scenarioRow.dataset.stepId),
              "Etape remise a tester.",
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
            "Etape validee.",
          );
          break;
        }

        case "mark-step-ko": {
          const scenarioRow = actionTarget.closest("[data-step-id]");
          if (!scenarioRow) {
            return;
          }
          if (scenarioRow.dataset.stepStatus === "ko") {
            updateBoard(
              (board) => clearScenarioStepResult(board, cardId, scenarioRow.dataset.stepId),
              "Etape remise a tester.",
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
          if (!scenarioRow) {
            return;
          }
          closeScenarioBugForm(scenarioRow);
          break;
        }

        case "save-step-bug": {
          const scenarioRow = actionTarget.closest("[data-step-id]");
          if (!scenarioRow) {
            return;
          }

          const bugPayload = readScenarioBugPayload(scenarioRow);
          if (!hasCompleteBugPayload(bugPayload)) {
            scenarioRow.classList.add("is-bug-open", "is-bug-invalid");
            scenarioRow.querySelectorAll(".qa-step__bug-input").forEach((input) => {
              if (!input.value.trim()) {
                input.setAttribute("aria-invalid", "true");
              }
            });
            updateSaveStatus("Complete la description du bug et le comportement observe.");
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
            "Bug enregistre sur l'etape.",
          );
          break;
        }

        case "remove-screenshot": {
          const shot = actionTarget.closest("[data-screenshot-id]");
          if (!shot) {
            return;
          }
          updateBoard(
            (board) => removeScreenshot(board, cardId, shot.dataset.screenshotId),
            "Screenshot supprime.",
          );
          break;
        }

        case "delete-card": {
          const confirmed = window.confirm(
            "Supprimer cette carte du board local ? Exporte le JSON si tu veux conserver une sauvegarde publiable.",
          );
          if (!confirmed) {
            return;
          }
          updateBoard((board) => deleteCard(board, cardId), "Carte supprimee.");
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
        (board) => setCardField(board, cardId, event.target.dataset.field, event.target.value),
        "Carte mise a jour.",
      );
      return;
    }

    if (event.target.classList.contains("card-text-input")
      || event.target.classList.contains("card-textarea")) {
      render();
      updateSaveStatus("Carte mise a jour.");
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
        (board) => setCardField(board, cardId, event.target.dataset.field, event.target.value),
        "Carte enregistree.",
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
    if (shouldIgnoreGlobalShortcut(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (cardCountAnimationEnabled && (event.key === "§" || event.key === "è")) {
      event.preventDefault();
      if (playCardCountAnimation?.()) {
        updateSaveStatus("Animation de carte lancee.");
      }
      return;
    }

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
      updateSaveStatus("Aucune image exploitable a importer.");
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
        "Screenshot(s) ajoute(s).",
      );
    } catch (error) {
      console.error(error);
      updateSaveStatus("Impossible d'importer les screenshots.");
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
      || "Le scenario doit etre coherent, stable et exploitable sans blocage majeur.";

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

  function shouldIgnoreGlobalShortcut(target) {
    return Boolean(
      target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"),
    );
  }

  return {
    handleBoardClick,
    handleBoardChange,
    handleBoardInput,
    handleBoardKeydown,
    handleDocumentKeydown,
    handleBoardDragOver,
    handleBoardDragLeave,
    handleBoardDrop,
  };
}
