"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { searchIssuesAction, type SearchHit } from "@/lib/actions/search";
import { statusLabels } from "@/lib/issues";

/** Long enough to skip a keystroke burst, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

/** cmdk item value for the escape hatch to the full, filtered issue list. */
const SEE_ALL = "__see-all__";

/**
 * Global issue search, as a ⌘K command palette.
 *
 * WHY THIS REPLACED 240 LINES OF HAND-ROLLED COMBOBOX: the previous version
 * implemented arrow-key navigation, wrap-around, `aria-activedescendant`,
 * outside-click dismissal and a shared mouse/keyboard highlight by hand. All of
 * it worked, and all of it was code with no product value that had to stay
 * correct forever. What it still lacked is the part that is genuinely hard:
 * focus was never trapped, focus was never restored to the trigger on close,
 * the panel was absolutely positioned rather than collision-aware, background
 * scroll was not locked, and the whole thing was `hidden sm:block` -- there was
 * no search on a phone at all. cmdk and Base UI's Dialog bring those.
 *
 * TWO THINGS THAT DID NOT SURVIVE THE MOVE INTACT, and how they are handled:
 *
 *   1. cmdk filters its own items client-side. This search is server-side and
 *      does prefix/substring matching in Postgres with an exact-key shortcut,
 *      so `shouldFilter={false}` is REQUIRED. Left on, cmdk would re-filter the
 *      server's results by naive substring match and silently hide correct
 *      hits -- most visibly an exact key search like "FLOW-12", where the
 *      server's best answer does not contain the query as a substring of the
 *      title.
 *
 *   2. The old Enter-with-nothing-highlighted fallback to the full issue list.
 *      cmdk always keeps one item active, so there is no "nothing highlighted"
 *      state to hang it off. It is now an explicit last item instead, which is
 *      better: it is visible rather than a thing you had to know.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  /**
   * cmdk's active item, controlled.
   *
   * WHY THIS IS NOT LEFT TO cmdk: with `shouldFilter={false}` cmdk does not
   * re-derive its selection when the item list changes underneath it, and the
   * "See all matches" row is the one item present for every query. So after
   * typing, the highlight stayed on that row and Enter went to the filtered
   * list instead of the top result -- which defeats the point of a search
   * palette, where the first thing you want is the best match on Enter.
   *
   * Reset happens in the fetch callback below rather than in a render-phase
   * effect, so it is not a cascading render.
   */
  const [selected, setSelected] = useState("");

  /**
   * Cmd/Ctrl+K toggles the palette.
   *
   * Toggle rather than open-only: pressing the shortcut again is what a user
   * who opened it by accident reaches for first, and it costs nothing.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Debounced, race-guarded search.
   *
   * The cleanup does double duty: it cancels the pending timer AND sets a
   * `cancelled` flag the async callback checks before writing state. Without the
   * flag, a slow request for "flo" can resolve after a fast one for "flowboard"
   * and overwrite the newer results with older ones -- the classic race that
   * makes a search box show results for something you already finished typing.
   */
  useEffect(() => {
    const trimmed = query.trim();
    // Returns without touching state: "too short to search" is derivable from
    // `query` at render time, and clearing here would be a synchronous setState
    // inside an effect. See `visibleHits`.
    if (trimmed.length < 2) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      // Set inside the timer, not the effect body, so a fast typist never sees
      // a "Searching…" flash.
      if (!cancelled) setIsSearching(true);
      try {
        const results = await searchIssuesAction(trimmed);
        if (cancelled) return;
        setHits(results);
        setSelected(results[0]?.id ?? SEE_ALL);
      } catch {
        if (!cancelled) {
          setHits([]);
          setSelected(SEE_ALL);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setHits([]);
    setSelected("");
  }, []);

  const trimmedQuery = query.trim();
  /**
   * Derived, not stored. While the query is too short -- or has been edited
   * since the last response -- stale hits must not render, and deriving that is
   * simpler and more correct than remembering to clear a second piece of state
   * on every path.
   */
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  return (
    <>
      {/*
        A visible trigger, styled as the field it replaces. Discoverability:
        nobody guesses a shortcut that is not shown. Unlike the old input this
        is not `hidden sm:block` -- on a phone it collapses to the icon alone
        and still opens the palette, so search finally exists on mobile.
      */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Search issues"
        className="press flex h-8 items-center gap-2 border border-border bg-canvas px-2 text-sm text-muted-foreground hover:border-accent hover:text-foreground sm:w-56 sm:justify-between"
      >
        <span className="flex items-center gap-2">
          <Search className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search issues...</span>
        </span>
        <kbd className="hidden border border-border px-1 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={isOpen}
        onOpenChange={(open) => (open ? setIsOpen(true) : close())}
        title="Search issues"
        description="Search by issue key or title."
        // See globals.css: a palette opened by keyboard many times a day must
        // not animate. `border-border` replaces the default soft ring, because
        // structure in this interface comes from hairlines.
        className="palette-instant w-full border border-border !ring-0 sm:max-w-xl"
      >
        <Command
          value={selected}
          onValueChange={setSelected}
          shouldFilter={false}
          loop
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search by key or title..."
          />

          <CommandList>
            {/*
              Three distinct empty states, because "nothing here" has three very
              different meanings and collapsing them is what makes a search box
              feel broken: nothing typed yet, a request in flight, and a
              genuinely empty result.
            */}
            {trimmedQuery.length < 2 ? (
              <CommandEmpty>Type at least two characters.</CommandEmpty>
            ) : isSearching && visibleHits.length === 0 ? (
              <CommandEmpty>Searching…</CommandEmpty>
            ) : visibleHits.length === 0 ? (
              <CommandEmpty>No issues match “{trimmedQuery}”.</CommandEmpty>
            ) : null}

            {visibleHits.length > 0 && (
              <CommandGroup heading="Issues">
                {visibleHits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    // cmdk dedupes and orders by `value`; the key is unique and
                    // stable, whereas titles are neither.
                    value={hit.id}
                    onSelect={() => {
                      close();
                      router.push(`/issues/${hit.key}`);
                    }}
                    className="gap-2"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {hit.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {statusLabels[hit.status as keyof typeof statusLabels] ??
                        hit.status}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {trimmedQuery.length >= 2 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {/*
                    Reuses the issue list's existing ?q= filter rather than
                    inventing a second search surface, so the palette stays
                    useful when the quick results miss.
                  */}
                  <CommandItem
                    value={SEE_ALL}
                    onSelect={() => {
                      close();
                      router.push(`/issues?q=${encodeURIComponent(trimmedQuery)}`);
                    }}
                  >
                    See all matches for “{trimmedQuery}”
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
