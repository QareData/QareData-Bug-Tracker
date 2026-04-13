export function createModalController({
  elements,
  store,
  findCardContext,
  renderCardDetailed,
}) {
  let activeModalCardId = null;

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

  function getActiveModalCardId() {
    return activeModalCardId;
  }

  return {
    openCardModal,
    renderModalCard,
    closeCardModal,
    syncBodyScrollLock,
    getActiveModalCardId,
  };
}
