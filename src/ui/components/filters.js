import {
  getPageOptions,
  getSurfaceOptions,
} from "../../core/state.js?v=20260407-ui-fixes-2";

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

  if (fallbackValue) {
    select.value = fallbackValue;
  }
}
