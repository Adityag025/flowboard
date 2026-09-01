"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Keeps the board fresh when someone else changes it.
 *
 * Renders nothing visible except a small "updated" indicator. All it does is
 * listen for a signal and call router.refresh(), which re-runs the page's own
 * server query -- so the data path is identical to a normal load and there is no
 * second rendering code path to keep in sync.
 */
export function RealtimeSync({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(`/api/realtime/board/${projectId}`);

    source.addEventListener("board:changed", () => {
      /**
       * refresh() re-fetches the server component tree and reconciles it into
       * the existing React tree -- it does NOT reload the page, so scroll
       * position, focus and any in-flight drag survive.
       */
      router.refresh();
      setJustUpdated(true);
      window.setTimeout(() => setJustUpdated(false), 2_000);
    });

    source.onerror = () => {
      /**
       * EventSource reconnects on its own with backoff, so a transient drop
       * needs no handling. But a 501 (realtime not configured) is permanent, and
       * the browser would retry it forever -- readyState CLOSED means the
       * browser has given up, and so should we.
       */
      if (source.readyState === EventSource.CLOSED) {
        source.close();
      }
    };

    // Closing on unmount is not optional: the server holds a Redis connection
    // per subscriber, so an abandoned stream leaks one per navigation.
    return () => source.close();
  }, [projectId, enabled, router]);

  if (!justUpdated) return null;

  return (
    <p
      role="status"
      className="text-xs text-accent"
      // Announced politely rather than as an alert: it is informational, and an
      // assertive live region would interrupt whatever a screen reader is
      // reading every time a colleague drags a card.
      aria-live="polite"
    >
      Board updated by someone else
    </p>
  );
}
