import {
  addScenarioStep,
  addScreenshot,
  flattenBoard,
  markScenarioStepOk,
  saveScenarioStepBug,
  setCardField,
  updateBoardMeta,
} from "../core/state.js?v=20260407-pdf-phase1-1";
import { cleanText, generateId } from "../utils/format.js?v=20260407-pdf-phase1-1";

const DEFAULT_CHAOS_LEVEL = 35;
const TESTER_POOL = [
  "Lina QA",
  "Camille Test",
  "Noah Recette",
  "Sarah Produit",
  "Yanis Mobile",
  "Ines Validation",
];

const ENVIRONMENT_POOL = [
  "Staging Web",
  "Préprod iPhone 15",
  "Préprod Android Pixel 8",
  "Recette Manager",
  "Sandbox Portail",
  "Campagne transverse",
];

const NOTE_OBSERVATIONS = [
  "Parcours rejoué avec des données cohérentes, sans anomalie de navigation visible.",
  "Temps de réponse correct sur le flux principal, quelques transitions restent à surveiller.",
  "Le wording est globalement lisible et l'enchainement des étapes reste compréhensible.",
  "Le comportement observé est stable sur ce passage, avec une validation rapide des contrôles clés.",
  "Le scénario est exploitable, mais mérite une nouvelle passe de contrôle sur les états intermédiaires.",
];

const MANUAL_STEP_TEMPLATES = [
  "Contrôler l'état récapitulatif après validation des données.",
  "Vérifier le retour visuel après l'action principale.",
  "Tester une relance du flux après une première soumission.",
  "Comparer le résultat affiché avec le comportement attendu côté métier.",
  "Valider la cohérence des informations de synthèse.",
];

const CHAOS_REASONS = [
  {
    label: "latence de confirmation",
    shortExplanation: "la validation serveur tarde et l'écran reste dans un état intermédiaire.",
  },
  {
    label: "état non rafraîchi",
    shortExplanation: "la vue conserve d'anciennes données après l'action principale.",
  },
  {
    label: "composant désynchronisé",
    shortExplanation: "un champ ou un composant perd sa valeur pendant la transition.",
  },
  {
    label: "retour visuel incohérent",
    shortExplanation: "l'utilisateur voit un retour ambigu qui ne reflète pas l'action effectuée.",
  },
  {
    label: "contrôle métier incomplet",
    shortExplanation: "une règle fonctionnelle bloque le scénario alors que les données semblent correctes.",
  },
  {
    label: "navigation instable",
    shortExplanation: "le flux redirige vers un écran inattendu après la soumission.",
  },
  {
    label: "chargement partiel",
    shortExplanation: "une partie des informations attendues n'est pas affichée au bon moment.",
  },
  {
    label: "action ignorée",
    shortExplanation: "le clic ou la validation n'est pas pris en compte du premier coup.",
  },
];

export function askRandomQaSimulationSettings(board, defaults = {}) {
  const totalCards = flattenBoard(board).length;
  if (!totalCards) {
    return null;
  }

  const suggestedCards = resolveCardsToTouch(totalCards);
  const rawCardsAnswer = globalThis.prompt?.(
    `Nombre de cartes a simuler ?\nEntre 1 et ${totalCards}. Laisser vide pour ${suggestedCards}.`,
    String(suggestedCards),
  );
  if (rawCardsAnswer === null) {
    return null;
  }

  const rawChaosAnswer = globalThis.prompt?.(
    "Niveau de chaos ?\n0 = presque tout passe, 100 = beaucoup d'echecs.",
    String(DEFAULT_CHAOS_LEVEL),
  );
  if (rawChaosAnswer === null) {
    return null;
  }

  const includeFakeScreenshots = Boolean(
    globalThis.confirm?.("Ajouter des captures factices pour le PDF ?"),
  );

  return {
    tester: cleanText(defaults.tester),
    environment: cleanText(defaults.environment),
    cardsToTouch: normalizeRequestedCards(rawCardsAnswer, totalCards, suggestedCards),
    chaosLevel: normalizeChaosLevel(rawChaosAnswer),
    includeFakeScreenshots,
  };
}

export function runRandomQaSimulation(board, options = {}) {
  const cards = flattenBoard(board);
  if (!cards.length) {
    return {
      board,
      summary: {
        cardsTouched: 0,
        notesWritten: 0,
        stepsOk: 0,
        bugsLogged: 0,
        manualStepsAdded: 0,
        screenshotsAdded: 0,
        chaosLevel: 0,
        message: "Aucune carte disponible pour la simulation.",
      },
    };
  }

  const tester = cleanText(options.tester) || pickOne(TESTER_POOL);
  const environment = cleanText(options.environment) || pickOne(ENVIRONMENT_POOL);
  const chaosLevel = normalizeChaosLevel(options.chaosLevel);
  const includeFakeScreenshots = options.includeFakeScreenshots !== false;
  const timestamp = new Date();

  let nextBoard = updateBoardMeta(board, {
    tester,
    environment,
  });

  const targetedEntries = shuffle(cards).slice(
    0,
    resolveCardsToTouch(cards.length, options.cardsToTouch),
  );

  const summary = {
    cardsTouched: 0,
    notesWritten: 0,
    stepsOk: 0,
    bugsLogged: 0,
    manualStepsAdded: 0,
    screenshotsAdded: 0,
    cardsDone: 0,
    cardsInProgress: 0,
    chaosLevel,
  };

  targetedEntries.forEach((entry) => {
    let currentCard = findCardById(nextBoard, entry.card.id);
    if (!currentCard) {
      return;
    }

    const outcome = pickOutcome(currentCard, chaosLevel);
    const reason = outcome === "done" ? null : pickChaosReason(chaosLevel);
    summary.cardsTouched += 1;

    nextBoard = setCardField(nextBoard, entry.card.id, "tester", tester);
    nextBoard = setCardField(nextBoard, entry.card.id, "environment", environment);

    currentCard = findCardById(nextBoard, entry.card.id);
    if (!currentCard) {
      return;
    }

    if (currentCard.checklist.length && currentCard.checklist.length < 5 && Math.random() < 0.16 + (chaosLevel / 100) * 0.3) {
      nextBoard = addScenarioStep(nextBoard, entry.card.id, pickOne(MANUAL_STEP_TEMPLATES));
      summary.manualStepsAdded += 1;
      currentCard = findCardById(nextBoard, entry.card.id);
      if (!currentCard) {
        return;
      }
    }

    if (outcome === "buggy") {
      nextBoard = setCardField(nextBoard, entry.card.id, "severity", pickWeightedSeverity(chaosLevel));
    } else if (Math.random() < 0.22 + (chaosLevel / 100) * 0.32) {
      nextBoard = setCardField(
        nextBoard,
        entry.card.id,
        "severity",
        Math.random() < 0.72 ? "major" : "minor",
      );
    }

    currentCard = findCardById(nextBoard, entry.card.id);
    if (!currentCard) {
      return;
    }

    const note = buildSimulationNote(currentCard, entry, {
      tester,
      environment,
      timestamp,
      outcome,
      reason,
      chaosLevel,
    });

    nextBoard = setCardField(
      nextBoard,
      entry.card.id,
      "notes",
      appendSimulationBlock(currentCard.notes, note),
    );
    summary.notesWritten += 1;

    currentCard = findCardById(nextBoard, entry.card.id);
    if (!currentCard) {
      return;
    }

    if (!currentCard.checklist.length) {
      if (outcome === "done") {
        nextBoard = setCardField(nextBoard, entry.card.id, "status", "done");
        summary.cardsDone += 1;
      } else {
        nextBoard = setCardField(nextBoard, entry.card.id, "status", "progress");
        summary.cardsInProgress += 1;
      }

      const screenshotResult = attachSyntheticScreenshots(
        nextBoard,
        entry,
        currentCard,
        {
          outcome,
          reason,
          tester,
          environment,
          timestamp,
          chaosLevel,
          includeFakeScreenshots,
        },
      );
      nextBoard = screenshotResult.board;
      summary.screenshotsAdded += screenshotResult.count;
      return;
    }

    if (outcome === "done") {
      currentCard.checklist.forEach((step) => {
        nextBoard = markScenarioStepOk(nextBoard, entry.card.id, step.id, tester);
        summary.stepsOk += 1;
      });
      summary.cardsDone += 1;
    } else if (outcome === "progress") {
      const shuffledSteps = shuffle(currentCard.checklist);
      const stepsToValidate = resolveProgressValidatedSteps(currentCard.checklist.length, chaosLevel);

      shuffledSteps.slice(0, stepsToValidate).forEach((step) => {
        nextBoard = markScenarioStepOk(nextBoard, entry.card.id, step.id, tester);
        summary.stepsOk += 1;
      });
      summary.cardsInProgress += 1;
    } else {
      const shuffledSteps = shuffle(currentCard.checklist);
      const okCount = resolveBuggyValidatedSteps(currentCard.checklist.length, chaosLevel);
      const okSteps = shuffledSteps.slice(0, okCount);
      const bugStep = shuffledSteps[okCount] || shuffledSteps[0];

      okSteps.forEach((step) => {
        nextBoard = markScenarioStepOk(nextBoard, entry.card.id, step.id, tester);
        summary.stepsOk += 1;
      });

      nextBoard = saveScenarioStepBug(
        nextBoard,
        entry.card.id,
        bugStep.id,
        buildBugPayload(currentCard, bugStep, environment, reason),
        tester,
      );
      summary.bugsLogged += 1;
      summary.cardsInProgress += 1;
    }

    const refreshedCard = findCardById(nextBoard, entry.card.id);
    const screenshotResult = attachSyntheticScreenshots(
      nextBoard,
      entry,
      refreshedCard || currentCard,
      {
        outcome,
        reason,
        tester,
        environment,
        timestamp,
        chaosLevel,
        includeFakeScreenshots,
      },
    );
    nextBoard = screenshotResult.board;
    summary.screenshotsAdded += screenshotResult.count;
  });

  return {
    board: nextBoard,
    summary: {
      ...summary,
      message: buildSummaryMessage(summary),
    },
  };
}

function attachSyntheticScreenshots(board, entry, card, context) {
  if (!context.includeFakeScreenshots) {
    return { board, count: 0 };
  }

  const count = resolveFakeScreenshotCount(context.outcome, context.chaosLevel);
  if (!count) {
    return { board, count: 0 };
  }

  let nextBoard = board;
  let added = 0;
  for (let index = 0; index < count; index += 1) {
    const screenshot = createSyntheticScreenshot(entry, card, {
      ...context,
      index,
    });
    if (!screenshot) {
      continue;
    }
    nextBoard = addScreenshot(nextBoard, entry.card.id, screenshot);
    added += 1;
  }

  return { board: nextBoard, count: added };
}

function createSyntheticScreenshot(entry, card, context) {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;

  const graphic = canvas.getContext("2d");
  if (!graphic) {
    return null;
  }

  const palette = resolveOutcomePalette(context.outcome);

  const background = graphic.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, palette.base);
  background.addColorStop(1, palette.accent);
  graphic.fillStyle = background;
  graphic.fillRect(0, 0, canvas.width, canvas.height);

  graphic.fillStyle = "rgba(255, 255, 255, 0.08)";
  graphic.beginPath();
  graphic.arc(1130, 110, 180, 0, Math.PI * 2);
  graphic.fill();

  drawRoundedRect(graphic, 48, 40, 1184, 70, 24, "rgba(7, 21, 47, 0.22)");
  drawRoundedRect(graphic, 48, 132, 1184, 540, 34, "rgba(255, 255, 255, 0.96)");
  drawRoundedRect(graphic, 88, 182, 510, 110, 22, "rgba(0, 63, 181, 0.08)");
  drawRoundedRect(graphic, 620, 182, 570, 110, 22, "rgba(17, 45, 97, 0.08)");
  drawRoundedRect(graphic, 88, 320, 1102, 136, 24, "rgba(17, 45, 97, 0.06)");
  drawRoundedRect(graphic, 88, 482, 532, 146, 24, "rgba(17, 45, 97, 0.06)");
  drawRoundedRect(graphic, 658, 482, 532, 146, 24, palette.panel);

  if (context.outcome === "buggy") {
    drawRoundedRect(graphic, 668, 492, 512, 126, 20, "rgba(217, 45, 32, 0.14)");
    graphic.strokeStyle = "rgba(217, 45, 32, 0.38)";
    graphic.lineWidth = 4;
    graphic.strokeRect(684, 520, 480, 78);
  }

  graphic.fillStyle = "rgba(255, 255, 255, 0.94)";
  graphic.font = '600 26px "Poppins", sans-serif';
  graphic.fillText("QareData QA Auto Test", 76, 84);

  graphic.font = '400 20px "Poppins", sans-serif';
  graphic.fillStyle = "rgba(255, 255, 255, 0.82)";
  graphic.fillText(`${entry.surface.name} · ${entry.page.name}`, 820, 84);

  graphic.fillStyle = "#112d61";
  graphic.font = '700 28px "Poppins", sans-serif';
  graphic.fillText(truncateForShot(card.title, 58), 88, 240);

  graphic.fillStyle = "#4f6388";
  graphic.font = '500 20px "Poppins", sans-serif';
  graphic.fillText(`Testeur: ${context.tester}`, 88, 390);
  graphic.fillText(`Environnement: ${context.environment}`, 88, 424);
  graphic.fillText(`Chaos: ${context.chaosLevel}/100`, 668, 240);
  graphic.fillText(`Capture ${context.index + 1}`, 668, 274);

  graphic.fillStyle = "#07152f";
  graphic.font = '600 20px "Poppins", sans-serif';
  graphic.fillText("Observation simulée", 88, 528);
  graphic.fillText(resolveOutcomeLabel(context.outcome), 668, 528);

  graphic.fillStyle = "#55688d";
  graphic.font = '400 18px "Poppins", sans-serif';
  writeShotParagraph(
    graphic,
    context.reason?.shortExplanation || "Parcours simulé sans incident majeur sur ce passage.",
    88,
    562,
    496,
    28,
  );
  writeShotParagraph(
    graphic,
    context.reason
      ? `Cause: ${context.reason.label}.`
      : "Résultat conforme au comportement attendu sur les points rejoués.",
    668,
    562,
    470,
    28,
  );

  return {
    id: generateId("shot-sim"),
    name: `simulation-${sanitizeShotName(card.title)}-${context.index + 1}.jpg`,
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    createdAt: new Date().toISOString(),
  };
}

function buildSimulationNote(card, entry, context) {
  const header = `[Simulation QA ${formatTime(context.timestamp)}]`;
  const title = `Carte rejouée: ${card.title}.`;
  const location = `Contexte: ${entry.surface.name} · ${entry.page.name}.`;
  const observation = pickOne(NOTE_OBSERVATIONS);
  const outcomeLine =
    context.outcome === "done"
      ? "Résultat: parcours validé sur l'ensemble des points rejoués."
      : context.outcome === "buggy"
        ? "Résultat: anomalie bloquante ou majeure détectée pendant le test."
        : "Résultat: validation partielle avec des points encore instables.";
  const chaosLine =
    context.reason
      ? `Pourquoi ca coince: ${context.reason.shortExplanation}`
      : "Pourquoi ca passe: le flux reste stable sur cette simulation.";

  return [
    header,
    `Testeur: ${context.tester} · Environnement: ${context.environment} · Chaos: ${context.chaosLevel}/100`,
    location,
    title,
    observation,
    outcomeLine,
    chaosLine,
  ].join("\n");
}

function buildBugPayload(card, step, environment, reason) {
  const explanation =
    reason?.shortExplanation
    || "le flux ne restitue pas le resultat attendu après l'action utilisateur.";

  return {
    description: `Le scenario "${card.title}" echoue sur l'etape "${step.label}" a cause de ${reason?.label || "un comportement instable"}.`,
    observedBehavior: `Pendant le test sur ${environment}, ${explanation}`,
    expectedResult: `L'etape "${step.label}" doit se terminer correctement pour permettre la poursuite normale du scenario "${card.scenarioTitle || card.title}".`,
  };
}

function appendSimulationBlock(existingNotes, block) {
  const current = String(existingNotes || "").trim();
  if (!current) {
    return block;
  }

  return `${current}\n\n${block}`;
}

function pickOutcome(card, chaosLevel) {
  const chaosRatio = normalizeChaosLevel(chaosLevel) / 100;
  const progressChance = 0.18 + chaosRatio * 0.12;
  const buggyChance = 0.12 + chaosRatio * 0.33;
  const doneChance = Math.max(0.18, 1 - progressChance - buggyChance);
  const roll = Math.random();

  if (!card.checklist.length) {
    return roll < doneChance ? "done" : "progress";
  }

  if (roll < doneChance) {
    return "done";
  }
  if (roll < doneChance + progressChance) {
    return "progress";
  }
  return "buggy";
}

function pickChaosReason(chaosLevel) {
  const weightedPoolSize = Math.min(
    CHAOS_REASONS.length,
    3 + Math.round((normalizeChaosLevel(chaosLevel) / 100) * (CHAOS_REASONS.length - 3)),
  );

  return pickOne(CHAOS_REASONS.slice(0, weightedPoolSize));
}

function pickWeightedSeverity(chaosLevel) {
  const roll = Math.random();
  const blockerChance = 0.15 + (normalizeChaosLevel(chaosLevel) / 100) * 0.35;

  if (roll < blockerChance) {
    return "blocker";
  }
  if (roll < 0.86) {
    return "major";
  }
  return "minor";
}

function resolveCardsToTouch(totalCards, requestedCards) {
  if (Number.isFinite(Number(requestedCards)) && Number(requestedCards) > 0) {
    return clampNumber(Math.round(Number(requestedCards)), 1, totalCards);
  }

  if (totalCards <= 4) {
    return totalCards;
  }

  const min = Math.max(3, Math.ceil(totalCards * 0.2));
  const max = Math.max(min, Math.min(totalCards, Math.ceil(totalCards * 0.45)));
  return randomInt(min, max);
}

function normalizeRequestedCards(value, totalCards, fallback) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    return fallback;
  }

  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampNumber(parsed, 1, totalCards);
}

function normalizeChaosLevel(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHAOS_LEVEL;
  }

  return clampNumber(parsed, 0, 100);
}

function resolveProgressValidatedSteps(totalSteps, chaosLevel) {
  if (totalSteps <= 1) {
    return 0;
  }

  const chaosRatio = normalizeChaosLevel(chaosLevel) / 100;
  const maxSteps = Math.max(1, totalSteps - 1);
  const target = Math.round(maxSteps * (0.78 - chaosRatio * 0.58));
  return clampNumber(target, 1, maxSteps);
}

function resolveBuggyValidatedSteps(totalSteps, chaosLevel) {
  if (totalSteps <= 1) {
    return 0;
  }

  const chaosRatio = normalizeChaosLevel(chaosLevel) / 100;
  const maxSteps = Math.max(0, totalSteps - 1);
  const target = Math.floor(maxSteps * (0.48 - chaosRatio * 0.42));
  return clampNumber(target, 0, maxSteps);
}

function resolveFakeScreenshotCount(outcome, chaosLevel) {
  const chaosRatio = normalizeChaosLevel(chaosLevel) / 100;

  if (outcome === "buggy") {
    return Math.random() < 0.26 + chaosRatio * 0.44 ? 2 : 1;
  }

  if (outcome === "progress") {
    return Math.random() < 0.44 + chaosRatio * 0.26 ? 1 : 0;
  }

  return Math.random() < 0.18 ? 1 : 0;
}

function resolveOutcomePalette(outcome) {
  if (outcome === "buggy") {
    return {
      base: "#112d61",
      accent: "#5f1520",
      panel: "rgba(217, 45, 32, 0.12)",
    };
  }

  if (outcome === "progress") {
    return {
      base: "#112d61",
      accent: "#0a3585",
      panel: "rgba(255, 180, 77, 0.16)",
    };
  }

  return {
    base: "#112d61",
    accent: "#003fb5",
    panel: "rgba(110, 231, 183, 0.18)",
  };
}

function resolveOutcomeLabel(outcome) {
  if (outcome === "buggy") {
    return "Incident simule";
  }
  if (outcome === "progress") {
    return "Validation partielle";
  }
  return "Parcours valide";
}

function buildSummaryMessage(summary) {
  return [
    `Simulation QA chaos ${summary.chaosLevel}/100`,
    `${summary.cardsTouched} carte(s)`,
    `${summary.stepsOk} etape(s) validee(s)`,
    `${summary.bugsLogged} bug(s) simule(s)`,
    `${summary.screenshotsAdded} capture(s) generee(s)`,
    summary.manualStepsAdded ? `${summary.manualStepsAdded} etape(s) ajoutee(s)` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function findCardById(board, cardId) {
  return flattenBoard(board).find((entry) => entry.card.id === cardId)?.card || null;
}

function drawRoundedRect(graphic, x, y, width, height, radius, fillStyle) {
  graphic.fillStyle = fillStyle;
  graphic.beginPath();
  graphic.moveTo(x + radius, y);
  graphic.lineTo(x + width - radius, y);
  graphic.quadraticCurveTo(x + width, y, x + width, y + radius);
  graphic.lineTo(x + width, y + height - radius);
  graphic.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  graphic.lineTo(x + radius, y + height);
  graphic.quadraticCurveTo(x, y + height, x, y + height - radius);
  graphic.lineTo(x, y + radius);
  graphic.quadraticCurveTo(x, y, x + radius, y);
  graphic.closePath();
  graphic.fill();
}

function writeShotParagraph(graphic, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let offsetY = y;

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (graphic.measureText(nextLine).width > maxWidth && line) {
      graphic.fillText(line, x, offsetY);
      line = word;
      offsetY += lineHeight;
      return;
    }
    line = nextLine;
  });

  if (line) {
    graphic.fillText(line, x, offsetY);
  }
}

function sanitizeShotName(value) {
  return String(value || "carte")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "carte";
}

function truncateForShot(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}
