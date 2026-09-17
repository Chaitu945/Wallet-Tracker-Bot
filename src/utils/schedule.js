/**
 * Poll-interval → cron expression.
 *
 * node-cron's "every N minutes" form only accepts N <= 59. A larger value produces
 * an expression that never fires (or throws outright), leaving the bot silently
 * inert while looking healthy. This converts any requested interval into a valid
 * expression:
 *
 *   - a whole number of minutes up to 59 -> the every-N-minutes form
 *   - a whole number of hours (60, 120, ...) -> an hourly form
 *   - anything else -> clamped to 59 minutes, flagged
 *
 * Returns { expression, minutes, clamped, requested } so the caller can log
 * honestly rather than pretending the requested interval was honoured.
 */
function pollIntervalToCron(rawMinutes) {
  const requested = Number(rawMinutes);

  if (!Number.isFinite(requested) || requested < 1) {
    return { expression: "*/1 * * * *", minutes: 1, clamped: true, requested };
  }

  if (requested <= 59) {
    const minutes = Math.floor(requested);
    return { expression: `*/${minutes} * * * *`, minutes, clamped: false, requested };
  }

  // Whole hours (60, 120, 180...) can be expressed exactly.
  if (requested % 60 === 0) {
    const hours = Math.floor(requested / 60);
    if (hours <= 23) {
      return { expression: `0 */${hours} * * *`, minutes: requested, clamped: false, requested };
    }
  }

  // Nothing sensible left: clamp and let the caller warn.
  return { expression: "*/59 * * * *", minutes: 59, clamped: true, requested };
}

module.exports = { pollIntervalToCron };
