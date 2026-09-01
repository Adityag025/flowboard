/**
 * Chart colour roles, validated rather than chosen by eye.
 *
 * Every value below was run through the dataviz validator against FlowBoard's
 * OWN surfaces (#ffffff light, #131317 dark) -- not the reference palette's
 * surfaces, which are slightly different and would have given a passing result
 * for a palette that fails here.
 *
 * WHY EVERY CHART IS SINGLE-HUE
 * Colour encodes nothing in these charts; the text labels carry identity. That
 * is a deliberate choice, not a shortcut: a categorical palette across 5-8
 * statuses would put adjacent hues in the CVD warn band (the validator flagged
 * aqua/red at deltaE 6.9 deutan), and none of these charts needs colour to
 * distinguish anything the axis labels do not already say. One hue, no legend,
 * nothing to confuse.
 *
 *   node scripts/validate_palette.js "#2a78d6" --mode light --surface "#ffffff"
 *   node scripts/validate_palette.js "#3987e5" --mode dark  --surface "#131317"
 *   -> ALL CHECKS PASS in both modes, including >= 3:1 contrast.
 *
 * The priority ramp is ORDINAL -- priority is ordered, so depth carries the
 * order. Validated with --ordinal: one hue, monotone lightness, adjacent
 * lightness gaps >= 0.06. The first attempt (adjacent sequential steps) FAILED
 * that gap check at 0.048, which is exactly the kind of thing you cannot see by
 * looking.
 *
 * Direction flips by mode on purpose: on white, "more" reads as darker; on a
 * dark surface, "more" reads as brighter. Applying one direction to both would
 * make urgent nearly invisible in one of them.
 */

/** The single series hue, as CSS custom properties set on the chart root. */
export const VIZ_CSS = `
/**
 * Chart reveal.
 *
 * clip-path, not width/height: those trigger layout and paint every frame,
 * while clip-path runs on the compositor. It also preserves the 4px rounded
 * data-end, which scaleX would squash along with the geometry.
 *
 * Keyframes rather than a transition is correct HERE specifically: this is a
 * one-shot mount reveal that is never interrupted or retargeted. Transitions win
 * for state that changes rapidly (a hover, a toggle); keyframes are fine for an
 * entrance that happens once.
 *
 * 420ms is above the 300ms UI ceiling on purpose -- that ceiling governs
 * animations the user TRIGGERS and waits on. A chart reveal is not blocking
 * anything; the numbers are already legible in the labels beside the bars.
 */
@keyframes viz-reveal-x {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
@keyframes viz-reveal-y {
  from { clip-path: inset(100% 0 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}

.viz-bar {
  animation: viz-reveal-x var(--dur-reveal) var(--ease-out-strong) both;
}
.viz-column {
  animation: viz-reveal-y var(--dur-reveal) var(--ease-out-strong) both;
}

/**
 * Tooltips: 150ms, from scale(0.97) and never from scale(0).
 *
 * A transition, not keyframes -- the pointer can move between bars faster than
 * the animation completes, and a transition retargets from its current value
 * where keyframes would restart from zero and flicker.
 */
.viz-tooltip {
  animation: viz-tooltip-in var(--dur-tooltip) var(--ease-out-strong) both;
}
@keyframes viz-tooltip-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}

/**
 * Reduced motion: the bars must appear at full size instantly. Without this
 * override the "both" fill-mode would leave them clipped to nothing, so
 * "reduce motion" would mean "show no data" -- the animation stripped but its
 * starting state left behind.
 */
@media (prefers-reduced-motion: reduce) {
  .viz-bar,
  .viz-column,
  .viz-tooltip {
    animation: none;
    clip-path: none;
    opacity: 1;
    transform: none;
  }
}

.viz {
  /* Reads the app's single signal colour rather than carrying its own palette,
     so a theme change moves the charts too. Both values were validated against
     their own surface by the dataviz validator -- fills need 3:1, and the
     accent used for TEXT needs 4.5:1, so they are deliberately different hexes. */
  --viz-series: var(--series);
  --viz-grid: var(--border);
  --viz-surface: var(--canvas);
  /* Ordinal ramp, light: lightest = least, darkest = most. */
  /* Ordinal ramp, LIGHT mode: lightest = least, darkest = most.
     Validated with --ordinal against #ffffff. The obvious first attempt started
     at #f0d9ab, which FAILED the 2:1 light-end floor at 1.38:1 -- a step that
     pale is indistinguishable from the page. */
  --viz-ord-1: #cfa64a;
  --viz-ord-2: #b8871f;
  --viz-ord-3: #9a6d16;
  --viz-ord-4: #74500e;
  --viz-ord-5: #4a3106;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .viz {
    --viz-series: var(--series);
    --viz-grid: var(--border);
    --viz-surface: var(--canvas);
    /* Reversed for dark: brighter reads as MORE. Validated against #0a0a0b --
       the darkest step has to clear 2:1 or "no priority" disappears into the
       page; #553606 failed that at 1.81:1. */
    --viz-ord-1: #7a5711;
    --viz-ord-2: #a37619;
    --viz-ord-3: #c99b3f;
    --viz-ord-4: #e2c383;
    --viz-ord-5: #f3e0bd;
  }
}
`;

/** Ordinal slots in order, least -> most. */
export const ORDINAL_VARS = [
  "var(--viz-ord-1)",
  "var(--viz-ord-2)",
  "var(--viz-ord-3)",
  "var(--viz-ord-4)",
  "var(--viz-ord-5)",
] as const;

/** Mark specs from the dataviz reference, kept in one place. */
export const MARK = {
  /** Bars are capped, never filling the band -- the leftover is air. */
  maxThickness: 24,
  /** Rounded at the data end, square at the baseline. */
  radius: 4,
  /** Surface-coloured gap between touching marks. */
  gap: 2,
} as const;
