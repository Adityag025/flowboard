"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Keeps the board fresh when someone else changes it.
 *
 * Renders nothing. It listens for a signal, calls router.refresh(), and raises
 * a toast so the change is explained -- without it, cards move on screen for no
 * visible reason, which reads as a bug rather than as a colleague working.
 *
 * WHY A TOAST RATHER THAN THE INLINE INDICATOR THIS USED TO RENDER: the old
 * version kept a `justUpdated` boolean and a 2s setTimeout to clear it, which is
 * a hand-rolled reimplementation of a toast with three defects. Its position
 * depended on wherever this component happened to be mounted. Two changes
 * arriving a second apart restarted the timer instead of re-announcing, so a
 * burst of activity showed one flicker. And there was no way to dismiss it or to
 * pause it while reading.
 *
 * The `id` is the important detail: a fixed id makes sonner REPLACE the existing
 * toast rather than stack a new one, so a colleague dragging six cards in a row
 * produces one steady message instead of a six-high tower.
 */
export function RealtimeSync({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const router = useRouter();

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
      toast("Board updated by someone else", { id: "board-changed" });
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

  return null;
}
