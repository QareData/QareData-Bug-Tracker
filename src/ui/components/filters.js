import {
  getPageOptions,
  getSurfaceOptions,
} from "../../core/state.js?v=20260409-crud-cards-3";

export function syncSidebarOptions(board, elements, filters) {
  hydrateSelect(
    elements.surfaceFilter,
    [{ id: "all", name: "Toutes les surfaces" }, ...getSurfaceOptions(board)],
    filters.surface,
  );

  hydrateSelect(
    elements.pageFilter,
    [{ id: "all", name: "Toutes les pages" }, ...getPageOptions(board, filters.surface)],
    filters.page,
  );

  hydrateSelect(
    elements.newCardSurface,
    getSurfaceOptions(board),
    elements.newCardSurface.value || "manager",
  );

  const editorSurfaceId = elements.newCardSurface?.value || "manager";
  hydrateSelect(
    elements.newCardPage,
    [
      { id: "", name: "Sélectionner page" },
      ...getPageOptions(board, editorSurfaceId).map((option) => ({
        id: option.name,
        name: option.name,
      })),
    ],
    elements.newCardPage.value || "",
  );
}

function hydrateSelect(select, options, selectedValue) {
  if (!select) {
    return;
  }

  const currentSignature = options.map((option) => `${option.id}:${option.name}`).join("|");
  if (select.dataset.signature !== currentSignature) {
    select.innerHTML = options
      .map(
        (option) =>
          `<option value="${option.id}">${option.name}</option>`,
      )
      .join("");
    select.dataset.signature = currentSignature;
  }

  const fallbackValue = options.some((option) => option.id === selectedValue)
    ? selectedValue
    : options[0]?.id;

  if (fallbackValue !== undefined) {
    select.value = fallbackValue;
  }
}
