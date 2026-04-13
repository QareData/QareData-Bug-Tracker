import { cleanText } from "../utils/format.js";

export function buildContextDescription(card = {}) {
  if (card.legacyContext?.description) {
    return cleanText(card.legacyContext.description);
  }

  const sourceIssues = toCleanTextList(card.sourceIssues);
  if (sourceIssues.length) {
    return sourceIssues.join(" ");
  }

  const validatedPoints = toCleanTextList(card.validatedPoints);
  if (validatedPoints.length) {
    return validatedPoints.join(" ");
  }

  const scenarioLabel = cleanText(card.scenarioTitle || card.title || "ce scénario") || "ce scénario";
  return `Le flux "${scenarioLabel}" doit être rejoué dans des conditions proches de l'usage réel afin de documenter le comportement observé et les éventuels écarts restants.`;
}

export function buildContextExpected(card = {}) {
  if (card.legacyContext?.expectedResult) {
    return cleanText(card.legacyContext.expectedResult);
  }

  const advice = toCleanTextList(card.advice);
  if (advice.length) {
    return advice.join(" ");
  }

  const validatedPoints = toCleanTextList(card.validatedPoints);
  if (validatedPoints.length) {
    return validatedPoints.join(" ");
  }

  return "Le scénario doit être cohérent, stable et exploitable sans blocage majeur.";
}

function toCleanTextList(items) {
  return Array.isArray(items)
    ? items.map((item) => cleanText(item)).filter(Boolean)
    : [];
}
