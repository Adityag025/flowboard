/**
 * The table view every chart is obliged to have.
 *
 * Three separate reasons it exists, and the third is the one people forget:
 *   1. A screen reader cannot read a bar.
 *   2. Colour-vision or contrast problems can make a mark ambiguous.
 *   3. Sometimes you just want the number, and reading it off a bar is worse
 *      than reading it from a row.
 *
 * A <details> element, so it needs NO JavaScript -- it works before hydration and
 * with JS disabled entirely. A client-side toggle would have been more code for
 * a strictly worse result.
 *
 * Server Component: pure markup, ships nothing.
 */
export function DataTable({
  sections,
}: {
  sections: Array<{ title: string; rows: Array<{ label: string; value: string | number }> }>;
}) {
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
        View the data as a table
      </summary>

      <div className="grid gap-6 border-t border-border px-5 py-4 sm:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {section.title}
            </h3>
            <table className="w-full text-sm">
              {/* A caption, not just a heading: it binds the description to the
                  table for assistive tech rather than relying on proximity. */}
              <caption className="sr-only">{section.title}</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="pb-1 font-medium">Category</th>
                  <th scope="col" className="pb-1 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {section.rows.map((row) => (
                  <tr key={row.label}>
                    {/* scope="row" so a screen reader announces the category
                        when reading the value cell. */}
                    <th scope="row" className="py-1.5 font-normal">{row.label}</th>
                    <td className="py-1.5 text-right tabular-nums">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  );
}
