export function findCardContext(board, cardId) {
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
