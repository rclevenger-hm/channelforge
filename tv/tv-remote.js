(() => {
  const selector = 'button, input, select, textarea, [role="button"], video';

  window.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("tv-runtime");
    focusFirst();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) return;
    const active = document.activeElement;
    if (key === "Enter" && active?.matches('[role="button"]')) {
      active.click();
      return;
    }
    if (key.startsWith("Arrow")) {
      event.preventDefault();
      moveFocus(key);
    }
  });

  function focusFirst() {
    const target = getFocusable()[0];
    if (target) target.focus();
  }

  function moveFocus(key) {
    const focusable = getFocusable();
    if (!focusable.length) return;
    const current = document.activeElement && focusable.includes(document.activeElement) ? document.activeElement : focusable[0];
    const currentRect = current.getBoundingClientRect();
    const candidates = focusable
      .filter((item) => item !== current)
      .map((item) => ({ item, score: scoreCandidate(currentRect, item.getBoundingClientRect(), key) }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => a.score - b.score);
    (candidates[0]?.item || current).focus();
  }

  function getFocusable() {
    return [...document.querySelectorAll(selector)].filter((item) => {
      const rect = item.getBoundingClientRect();
      return !item.disabled && !item.hidden && rect.width > 0 && rect.height > 0;
    });
  }

  function scoreCandidate(from, to, key) {
    const dx = centerX(to) - centerX(from);
    const dy = centerY(to) - centerY(from);
    if (key === "ArrowRight" && dx <= 0) return Infinity;
    if (key === "ArrowLeft" && dx >= 0) return Infinity;
    if (key === "ArrowDown" && dy <= 0) return Infinity;
    if (key === "ArrowUp" && dy >= 0) return Infinity;
    const primary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dx) : Math.abs(dy);
    const secondary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    return primary * 2 + secondary;
  }

  function centerX(rect) {
    return rect.left + rect.width / 2;
  }

  function centerY(rect) {
    return rect.top + rect.height / 2;
  }
})();
