import Redis from "ioredis";

import { logger } from "@/lib/logger";

/**
 * Realtime board updates: Server-Sent Events over Redis pub/sub.
 *
 * WHY SSE AND NOT WEBSOCKETS
 * WebSockets need a long-lived, stateful, bidirectional connection, which means
 * a separate socket server (or a hosted service) alongside the Next app -- Next
 * route handlers cannot upgrade a connection. That is a second deployable to
 * run, scale and secure.
 *
 * We do not need bidirectional. Clients already send changes through Server
 * Actions; the only missing direction is server -> client. SSE does exactly
 * that, over plain HTTP, from a normal route handler, with automatic browser
 * reconnection built in. It is the smaller tool that fits.
 *
 * The honest limits of SSE: one direction only, and browsers cap concurrent
 * connections per origin (~6 on HTTP/1.1, effectively unlimited on HTTP/2). For
 * one board subscription per tab that is fine.
 *
 * WHY REDIS PUB/SUB
 * A plain in-process EventEmitter would work with exactly one server process. Two
 * instances and a mutation on instance A never reaches a subscriber on instance
 * B -- realtime that works locally and silently fails in production. Redis
 * pub/sub fans out across every instance.
 *
 * WHY WE PUBLISH A SIGNAL, NOT THE DATA
 * Events carry "the board changed", never the changed rows. Two reasons, and the
 * first is the important one:
 *
 *   1. AUTHORIZATION. Pushing rows means re-deriving, per subscriber, what that
 *      subscriber is allowed to see -- inside a fan-out path where a mistake is
 *      a silent cross-tenant leak. A signal cannot leak anything.
 *   2. It keeps the server as the single source of truth: the client calls
 *      router.refresh(), the page re-runs its own scoped query, and there is one
 *      code path for rendering rather than one for load and one for updates.
 *
 * The cost is an extra round trip per change. Worth it.
 */

export type BoardEvent = {
  type: "board:changed";
  projectId: string;
  /** Who caused it, so the originator can ignore its own echo. */
  actorId: string;
  at: number;
};

function channelFor(projectId: string): string {
  return `realtime:board:${projectId}`;
}

/**
 * A publisher connection, separate from the app's main Redis client.
 *
 * Reusing the shared client for PUBLISH would be fine on its own -- but the
 * SUBSCRIBER below cannot be shared, because a connection in subscriber mode
 * rejects normal commands. Keeping publish and subscribe on their own
 * connections makes that constraint explicit rather than a trap.
 */
let publisher: Redis | null = null;
let publisherInit = false;

function getPublisher(): Redis | null {
  if (publisherInit) return publisher;
  publisherInit = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  publisher = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1_000 });
  publisher.on("error", (error) => {
    logger.warn("realtime publisher unavailable", {
      component: "realtime",
      reason: error.message,
    });
  });
  return publisher;
}

/**
 * Announce that a board changed.
 *
 * NEVER throws and never blocks the mutation that called it. A realtime
 * notification is a nice-to-have layered on top of a change that has already
 * been committed -- failing the user's drag because a pub/sub message did not
 * send would be strictly worse than them needing to refresh.
 */
export async function publishBoardChange(event: Omit<BoardEvent, "type" | "at">): Promise<void> {
  const redis = getPublisher();
  if (!redis) return;

  const payload: BoardEvent = { type: "board:changed", at: Date.now(), ...event };

  try {
    await redis.publish(channelFor(event.projectId), JSON.stringify(payload));
  } catch (error) {
    logger.warn("failed to publish board change", {
      component: "realtime",
      projectId: event.projectId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Subscribe to one board's changes.
 *
 * Returns an unsubscribe function, and the caller MUST call it. Each subscriber
 * holds its own Redis connection (subscriber mode is exclusive), so a leak here
 * is a leaked connection per abandoned browser tab -- which exhausts Redis
 * eventually, not immediately, i.e. the kind of leak found in production.
 */
export async function subscribeToBoard(
  projectId: string,
  onEvent: (event: BoardEvent) => void,
): Promise<(() => Promise<void>) | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const subscriber = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
  });

  subscriber.on("error", (error) => {
    logger.warn("realtime subscriber error", {
      component: "realtime",
      projectId,
      reason: error.message,
    });
  });

  subscriber.on("message", (_channel, message) => {
    try {
      const parsed = JSON.parse(message) as BoardEvent;
      if (parsed.type === "board:changed") onEvent(parsed);
    } catch {
      // A malformed message must not kill the stream for everyone on this
      // board. Drop it and keep going.
      logger.warn("dropped malformed realtime message", {
        component: "realtime",
        projectId,
      });
    }
  });

  await subscriber.subscribe(channelFor(projectId));

  return async () => {
    await subscriber.unsubscribe(channelFor(projectId)).catch(() => {});
    await subscriber.quit().catch(() => {});
  };
}

export function isRealtimeConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}
