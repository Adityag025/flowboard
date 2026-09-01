"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { searchIssuesAction, type SearchHit } from "@/lib/actions/search";
import { statusLabels } from "@/lib/issues";
import { cn } from "@/lib/utils";

/** Long enough to skip a keystroke burst, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  /** Which result the keyboard is on. -1 = the input itself. */
  const [active, setActive] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /**
   * Cmd/Ctrl+K focuses the field.
   *
   * NO ANIMATION on this path, deliberately. A keyboard shortcut is used dozens
   * of times a day, and an entrance animation on something that frequent reads
   * as lag -- the interface feeling slower than it is. The dropdown that follows
   * a keystroke is likewise instant.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close on outside click, like any menu.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  /**
   * Debounced search.
   *
   * The cleanup does double duty: it cancels the pending timer AND sets a
   * `cancelled` flag the async callback checks before writing state. Without the
   * flag, a slow request for "flo" can resolve after a fast one for "flowboard"
   * and overwrite the newer results with older ones -- the classic race that
   * makes a search box show results for something you already finished typing.
   */
  useEffect(() => {
    const trimmed = query.trim();
    /**
     * Returns WITHOUT touching state. Clearing `hits` here would be a
     * synchronous setState inside an effect, which React flags as a cascading
     * render -- and it is unnecessary, because "too short to search" is
     * derivable from `query` at render time. See `visibleHits` below.
     */
    if (trimmed.length < 2) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      // Set inside the timer, not the effect body: asynchronous, and it also
      // means a fast typist never sees a "Searching…" flash.
      if (!cancelled) setIsSearching(true);
      try {
        const results = await searchIssuesAction(trimmed);
        if (cancelled) return;
        setHits(results);
        setActive(-1);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function go(hit: SearchHit) {
    setIsOpen(false);
    setQuery("");
    router.push(`/issues/${hit.key}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Stop the caret jumping to either end of the input while navigating.
      event.preventDefault();
      if (hits.length === 0) return;
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        // Wraps, so holding one arrow never dead-ends.
        if (next < 0) return hits.length - 1;
        if (next >= hits.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && hits[active]) {
        go(hits[active]);
        return;
      }
      /**
       * Enter with nothing highlighted falls through to the full issue list,
       * filtered by the same term. So the search box is useful even when the
       * quick results miss -- and it reuses the list's existing ?q= filter
       * rather than inventing a second search surface.
       */
      const trimmed = query.trim();
      if (trimmed) {
        setIsOpen(false);
        router.push(`/issues?q=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  const trimmedQuery = query.trim();
  const showDropdown = isOpen && trimmedQuery.length >= 2;

  /**
   * Derived, not stored. While the query is too short -- or has been edited
   * since the last response -- stale hits must not render, and deriving that is
   * simpler and more correct than remembering to clear a second piece of state
   * on every path.
   */
  const visibleHits = trimmedQuery.length >= 2 ? hits : [];

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search issues..."
        // Combobox semantics so a screen reader announces that results appeared
        // and which one is active -- the dropdown is not just visual.
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="h-8 w-56 rounded-md border border-border bg-canvas pl-8 pr-12 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
      />

      {/* Discoverability: nobody guesses a shortcut that is not shown. */}
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted">
        ⌘K
      </kbd>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-10 z-50 w-96 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {isSearching && visibleHits.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Searching…</p>
          )}

          {!isSearching && visibleHits.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">
              No issues match “{query.trim()}”.
            </p>
          )}

          {visibleHits.map((hit, index) => (
            <button
              key={hit.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              type="button"
              // Mouse and keyboard share one highlight, so moving the pointer
              // does not leave a second, stale selection behind.
              onMouseEnter={() => setActive(index)}
              onClick={() => go(hit)}
              className={cn(
                "flex w-full items-baseline gap-2 px-3 py-2 text-left",
                index === active && "bg-surface-hover",
              )}
            >
              <span className="shrink-0 font-mono text-[11px] text-muted">{hit.key}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{hit.title}</span>
              <span className="shrink-0 text-[10px] text-muted">
                {statusLabels[hit.status as keyof typeof statusLabels] ?? hit.status}
              </span>
            </button>
          ))}

          {visibleHits.length > 0 && (
            <div className="mt-1 border-t border-border px-3 py-1.5 text-[10px] text-muted">
              Enter to open · ↑↓ to navigate · Enter with nothing selected sees all matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
