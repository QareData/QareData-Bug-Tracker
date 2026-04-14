const DEFAULT_CARD_COUNT_TRIGGERS = [24];
const CARD_COUNT_ANIMATION_CLASS = "card-count-celebration";
const CARD_COUNT_ANIMATION_DURATION_MS = 2400;
const CARD_COUNT_ANIMATION_AMPLEUR_PERCENT = 200;

export function isCardCountMilestone(cardCount, triggerCounts = DEFAULT_CARD_COUNT_TRIGGERS) {
  const normalizedCount = Number(cardCount);
  if (!Number.isFinite(normalizedCount)) {
    return false;
  }

  const triggerSet = new Set(
    triggerCounts
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );

  return triggerSet.has(normalizedCount);
}

export function createCardCountAnimationController({ root = document.body, triggerCounts } = {}) {
  const amplitudeScale = CARD_COUNT_ANIMATION_AMPLEUR_PERCENT / 100;
  const allowedCounts = new Set(
    (triggerCounts || DEFAULT_CARD_COUNT_TRIGGERS)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );
  let previousCount = null;
  let timerId = null;
  let hasSyncedOnce = false;

  function syncCardCountAnimation(cardCount) {
    const normalizedCount = Number(cardCount);
    if (!Number.isFinite(normalizedCount)) {
      return false;
    }

    const isMilestone = allowedCounts.has(normalizedCount);
    const shouldAnimate =
      hasSyncedOnce
      && isMilestone
      && previousCount !== normalizedCount
      && prefersReducedMotion() === false;

    previousCount = normalizedCount;
    hasSyncedOnce = true;

    if (!shouldAnimate) {
      return false;
    }

    playAnimation();
    return true;
  }

  function playCardCountAnimation() {
    if (prefersReducedMotion()) {
      return false;
    }

    playAnimation();
    return true;
  }

  function playAnimation() {
    if (!root) {
      return;
    }

    root.style.setProperty("--card-count-animation-amp-scale", String(amplitudeScale));
    root.classList.remove(CARD_COUNT_ANIMATION_CLASS);
    window.clearTimeout(timerId);

    // Force a reflow so the animation can restart even on repeated milestones.
    void root.offsetWidth;
    root.classList.add(CARD_COUNT_ANIMATION_CLASS);

    timerId = window.setTimeout(() => {
      root.classList.remove(CARD_COUNT_ANIMATION_CLASS);
      timerId = null;
    }, CARD_COUNT_ANIMATION_DURATION_MS);
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  return {
    playCardCountAnimation,
    syncCardCountAnimation,
  };
}
