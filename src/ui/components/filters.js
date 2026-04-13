import {
  getPageOptions,
  getSurfaceOptions,
} from "../../core/state.js";

export function syncSidebarOptions(board, elements, filters) {
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
