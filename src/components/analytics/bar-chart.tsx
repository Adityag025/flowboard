"use client";

import { useId, useState } from "react";

import { MARK } from "./viz-tokens";

export type BarDatum = {
  label: string;
  value: number;
  /** Optional per-bar colour, for an ordinal ramp. Defaults to the series hue. */
  color?: string;
};

/**
 * Horizontal bars for magnitude across named categories.
 *
 * HORIZONTAL, not vertical, because the categories have text labels ("In
 * Progress", "No priority", a person's name). Vertical columns force those
 * labels to rotate or truncate; horizontal bars give them a full line of room.
 *
 * A single series, so there is NO legend -- the heading says what is plotted, and
 * a one-swatch legend box would just restate it.
 *
 * Built as HTML/CSS rather than SVG: the marks are axis-aligned rectangles and
 * the labels are text that must wrap and truncate like text. SVG would mean
 * hand-measuring every string.
 */
export function BarChart({
  data,
  valueLabel,
  emptyMessage = "No data yet.",
}: {
  data: BarDatum[];
  /** Singular noun for the tooltip, e.g. "issue". */
  valueLabel: string;
  emptyMessage?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tooltipId = useId();

  const max = Math.max(...data.map((d) => d.value), 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="viz space-y-1.5">
      {data.map((datum, index) => {
        // Scaled against the largest bar, not the total: this compares
        // magnitudes, it is not a part-to-whole chart.
        const widthPercent = max > 0 ? (datum.value / max) * 100 : 0;
        const isHovered = hovered === index;

        return (
          <div
            key={datum.label}
            className="group relative grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3"
            // The whole row is the hit target, not just the bar -- a 3px bar for
            // a value of 1 is impossible to hover.
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            aria-describedby={isHovered ? tooltipId : undefined}
          >
            {/* Category label wears a TEXT token, never the series colour. */}
            <span className="truncate text-xs text-muted-foreground" title={datum.label}>
              {datum.label}
            </span>

            <div className="relative h-5">
              <div
                /**
                 * REVEALED WITH clip-path, NOT BY ANIMATING WIDTH.
                 *
                 * `width` triggers layout and paint on every frame. clip-path
                 * runs on the compositor, and unlike scaleX it does not distort
                 * the 4px rounded data-end -- scaling a rounded rectangle
                 * horizontally squashes the corner radius with it.
                 *
                 * The bar is laid out at its true width immediately, then the
                 * clip opens. So a reader with reduced motion (where the
                 * animation is stripped) sees the correct bar, not a collapsed
                 * one.
                 */
                className="viz-bar absolute inset-y-0 left-0"
                style={{
                  width: `${widthPercent}%`,
                  // Cap the thickness; the band's leftover is deliberate air.
                  maxHeight: MARK.maxThickness,
                  background: datum.color ?? "var(--viz-series)",
                  // Rounded at the data end, square at the baseline.
                  borderRadius: `0 ${MARK.radius}px ${MARK.radius}px 0`,
                  opacity: hovered === null || isHovered ? 1 : 0.55,
                  // A zero value still gets a visible sliver, so the row does
                  // not look like a rendering failure.
                  minWidth: datum.value > 0 ? 2 : 0,
                  // Stagger: 40ms apart, inside the 30-80ms band. Longer and the
                  // chart feels slow to arrive; the effect is decorative and
                  // never gates interaction.
                  animationDelay: `${index * 40}ms`,
                }}
              />
            </div>

            {/* Value at the tip -- the direct label the spec calls for on bars. */}
            <span className="text-right text-xs tabular-nums text-foreground">
              {datum.value}
            </span>

            {isHovered && (
              <span
                id={tooltipId}
                role="tooltip"
                /**
                 * Scales in from 0.97, never from 0 -- nothing in the real world
                 * appears out of nothing, and scale(0) reads as a glitch.
                 * transform-origin sits at the left edge, where the bar it
                 * describes begins, so it grows out of its subject rather than
                 * out of its own centre.
                 */
                className="viz-tooltip pointer-events-none absolute -top-7 left-28 z-10 origin-bottom-left whitespace-nowrap rounded border border-border bg-surface px-2 py-1 text-xs shadow-sm"
              >
                {datum.label}: {datum.value} {valueLabel}
                {datum.value === 1 ? "" : "s"}
                {total > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {Math.round((datum.value / total) * 100)}%
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
