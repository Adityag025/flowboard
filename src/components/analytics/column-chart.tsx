"use client";

import { useId, useState } from "react";

import { MARK } from "./viz-tokens";

export type ColumnDatum = { label: string; sublabel?: string; value: number };

/**
 * Vertical columns for a value across ordered time buckets.
 *
 * COLUMNS, NOT A LINE. A line implies a continuous quantity you could read
 * between the points -- but "issues completed in week 32" has no meaningful value
 * halfway between two weeks. Discrete buckets get discrete marks.
 *
 * Single series, so no legend. Direct labels are SELECTIVE, per the spec: the
 * most recent bucket (what the reader came for) and the peak, not a number on
 * every column. The gridlines and the tooltip carry the rest.
 */
export function ColumnChart({
  data,
  valueLabel,
}: {
  data: ColumnDatum[];
  valueLabel: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tooltipId = useId();

  const max = Math.max(...data.map((d) => d.value), 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  /**
   * A clean top gridline value rather than the raw max, so the axis reads
   * 0 / 3 / 6 instead of 0 / 3.5 / 7.
   */
  const ceiling = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const ticks = [ceiling, Math.round(ceiling / 2), 0];

  const peakIndex = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const lastIndex = data.length - 1;

  if (total === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Nothing completed in this period yet.
      </p>
    );
  }

  return (
    <div className="viz">
      <div className="flex gap-3">
        {/* Y axis: ticks carry the values that are not directly labelled. */}
        <div className="flex w-6 flex-col justify-between py-1 text-right text-[10px] tabular-nums text-muted-foreground">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Hairline, solid, recessive -- never dashed. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <div key={tick} className="h-px w-full" style={{ background: "var(--viz-grid)" }} />
            ))}
          </div>

          <div
            className="relative flex h-40 items-end"
            // The surface-coloured gap between adjacent columns IS the separator;
            // no borders are drawn on the marks.
            style={{ gap: MARK.gap }}
          >
            {data.map((datum, index) => {
              const heightPercent = ceiling > 0 ? (datum.value / ceiling) * 100 : 0;
              const isHovered = hovered === index;
              const isLabelled = index === lastIndex || index === peakIndex;

              return (
                <div
                  key={datum.label}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  aria-describedby={isHovered ? tooltipId : undefined}
                >
                  {isLabelled && datum.value > 0 && (
                    <span
                      className="absolute -top-4 text-[10px] tabular-nums text-foreground"
                      style={{ bottom: `calc(${heightPercent}% + 2px)`, top: "auto" }}
                    >
                      {datum.value}
                    </span>
                  )}

                  <div
                    // Same reasoning as the horizontal bars: clip-path on the
                    // compositor rather than an animated `height`, which would
                    // relayout the flex row every frame.
                    className="viz-column w-full"
                    style={{
                      height: `${heightPercent}%`,
                      animationDelay: `${index * 40}ms`,
                      maxWidth: MARK.maxThickness,
                      background: "var(--viz-series)",
                      // Rounded cap at the data end, square on the baseline.
                      borderRadius: `${MARK.radius}px ${MARK.radius}px 0 0`,
                      opacity: hovered === null || isHovered ? 1 : 0.55,
                      minHeight: datum.value > 0 ? 2 : 0,
                    }}
                  />

                  {isHovered && (
                    <span
                      id={tooltipId}
                      role="tooltip"
                      className="viz-tooltip pointer-events-none absolute bottom-full z-10 mb-1 origin-bottom whitespace-nowrap rounded border border-border bg-surface px-2 py-1 text-xs shadow-sm"
                    >
                      {datum.sublabel ?? datum.label}: {datum.value} {valueLabel}
                      {datum.value === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* X labels: every other one when crowded, so they never collide. */}
          <div className="mt-1.5 flex" style={{ gap: MARK.gap }}>
            {data.map((datum, index) => (
              <span
                key={datum.label}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {data.length > 8 && index % 2 === 1 ? "" : datum.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
