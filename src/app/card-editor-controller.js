export function createCardEditorController({
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
}) {
  const cardEditorState = {
    cardId: null,
  };

  function handleCreateCard() {
    const previousCardId = cardEditorState.cardId;
    const nextCardId = previousCardId || generateId("manual-card");
    const isEditing = Boolean(previousCardId);
    const validation = validateCardEditorRequiredFields();

    if (!validation.isValid) {
      focusFirstInvalidCardEditorField(validation.missingFields);
      updateSaveStatus("Complete les champs obligatoires avant d'enregistrer la carte.");
      window.alert(buildCardEditorValidationMessage(validation.missingLabels));
      return;
    }

    try {
      const payload = readCardEditorPayload(nextCardId);
      cardEditorState.cardId = nextCardId;
      updateBoard(
        (board) => upsertCardDefinition(board, payload),
        isEditing ? "Carte mise a jour localement." : "Carte QA creee localement.",
      );

      const savedContext = findCardContext(store.getState().board, nextCardId);
      if (savedContext) {
        populateCardEditor(savedContext);
      } else {
        cardEditorState.cardId = previousCardId;
      }

      if (!isEditing) {
        window.alert(
          "La carte a bien ete ajoutee localement.\n\nPour qu'elle soit vraiment prise en compte, exporte le JSON puis envoie-le sur Discord ou remplace le fichier sur GitHub.",
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
      "Supprimer cette carte du board local ? Pense a exporter le JSON si tu veux conserver une version avant suppression.",
    );
    if (!confirmed) {
      return;
    }

    const deletedCardId = cardEditorState.cardId;
    updateBoard((board) => deleteCard(board, deletedCardId), "Carte supprimee du board local.");
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
      throw new Error("Selectionne une surface pour la carte.");
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
        label: "Methode de test / contexte",
        fields: [elements.newCardMethod],
        isValid: () => Boolean(String(elements.newCardMethod?.value || "").trim()),
      },
      {
        label: "Resultat attendu",
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
      return "Complete les champs obligatoires avant d'enregistrer la carte.";
    }

    return [
      "Complete les champs obligatoires avant d'enregistrer la carte :",
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
      elements.cardEditorBadge.textContent = isEditing ? "Edition" : "Creation";
    }
    if (elements.cardEditorSubtitle) {
      elements.cardEditorSubtitle.textContent = isEditing
        ? `Modification locale de ${editingContext.surface.name} · ${editingContext.page.name}. Exporte le JSON pour publier ces changements sur GitHub.`
        : "Les modifications sont stockees localement. Exporte le JSON pour les publier sur GitHub.";
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
      emptyState.textContent = "Aucune etape definie. Ajoute-en pour cadrer le scenario.";
      root.append(emptyState);
    }

    labels.forEach((label, index) => {
      const row = document.createElement("div");
      row.className = "card-editor-step";
      row.dataset.stepIndex = String(index);

      const indexBadge = document.createElement("span");
      indexBadge.className = "card-editor-step__index";
      indexBadge.textContent = `Etape ${index + 1}`;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "card-text-input card-editor-step__input";
      input.placeholder = `Decris l'etape ${index + 1}`;
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

  function getCurrentCardId() {
    return cardEditorState.cardId;
  }

  function clearEditingCardIfMatches(cardId) {
    if (cardEditorState.cardId === cardId) {
      resetCardEditor();
    }
  }

  return {
    handleCreateCard,
    handleCancelCardEditor,
    handleDeleteEditorCard,
    handleCardEditorSurfaceChange,
    handleChecklistCountChange,
    handleAddChecklistStep,
    handleCardEditorChecklistClick,
    handleCardEditorValidationInteraction,
    openCardEditor,
    resetCardEditor,
    syncCardEditorUi,
    openCardEditorModal,
    closeCardEditorModal,
    getCurrentCardId,
    clearEditingCardIfMatches,
  };
}
