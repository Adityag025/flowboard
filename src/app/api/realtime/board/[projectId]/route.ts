import { requireIssueAccessless } from "@/lib/realtime-guard";
import { logger } from "@/lib/logger";
import { isRealtimeConfigured, subscribeToBoard } from "@/lib/realtime";

/**
 * SSE stream of board changes.
 *
 * The response never ends: it stays open and writes an event whenever the board
 * changes. The browser's EventSource reconnects on its own if it drops, which is
 * a large part of why SSE is worth preferring over hand-rolling this.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const log = logger.child({ route: "/api/realtime/board", projectId });

  if (!isRealtimeConfigured()) {
    // 501, not 500: the endpoint is understood and simply not enabled here.
    // The client uses this to stop retrying rather than reconnecting forever.
    return Response.json({ error: "Realtime is not configured" }, { status: 501 });
  }

  // A subscription is a read. It is authorised exactly like every other read --
  // membership in the WHERE clause -- because "which boards change" is itself
  // information about another tenant.
  const access = await requireIssueAccessless(projectId);
  if (!access.ok) {
    return Response.json({ error: "Not found" }, { status: access.status });
  }
  const { userId } = access;

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          // SSE wire format: "event:" then "data:" then a BLANK line. Omit the
          // blank line and the browser buffers forever waiting for the record
          // to end -- the classic silent SSE bug.
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Client vanished mid-write. Not an error worth logging.
        }
      };

      send("ready", { projectId });

      /**
       * Heartbeat comments every 25 seconds.
       *
       * Proxies and load balancers close idle connections, typically at 30-60s.
       * A board nobody is touching is idle by definition, so without this the
       * stream dies and reconnects in a loop. A line starting with ":" is an SSE
       * comment -- it keeps the socket warm and the client ignores it.
       */
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* closed */
        }
      }, 25_000);

      unsubscribe = await subscribeToBoard(projectId, (event) => {
        /**
         * Skip the originator's own change.
         *
         * They already applied it optimistically. Telling them to refresh would
         * throw away their optimistic state and make their own drag flicker --
         * the exact jank optimistic updates exist to remove.
         */
        if (event.actorId === userId) return;
        send("board:changed", { at: event.at });
      });

      // Tear down when the client disconnects -- closing the tab, navigating
      // away, or losing the network. Each subscriber owns a Redis connection,
      // so skipping this leaks one per abandoned tab.
      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        void unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        log.debug("realtime client disconnected", { userId });
      });

      log.debug("realtime client connected", { userId });
    },

    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      await unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // Must not be cached or buffered anywhere on the way to the browser.
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // nginx buffers proxied responses by default, which holds events until the
      // buffer fills -- realtime that arrives in batches minutes late.
      "X-Accel-Buffering": "no",
    },
  });
}
