import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRedis, isRedisConfigured } from "@/lib/redis";

/**
 * Health check for load balancers, container orchestrators and uptime monitors.
 *
 * TWO KINDS OF HEALTH, and conflating them is a classic outage amplifier:
 *
 *   LIVENESS  -- "is this process alive?" If this fails, restart the container.
 *   READINESS -- "can this process serve traffic?" If this fails, take it out of
 *                the load balancer rotation but do NOT restart it.
 *
 * A single endpoint that returns 503 when the database is briefly unreachable,
 * wired to a liveness probe, will restart every instance simultaneously during a
 * database blip -- turning a recoverable dependency problem into a full outage.
 * So `?check=deep` is opt-in, and the default is a cheap liveness answer.
 *
 * Deliberately UNAUTHENTICATED, because a probe cannot log in -- which is why it
 * returns component up/down and nothing else. No versions, no connection
 * strings, no error details; those are reconnaissance for an attacker and belong
 * in logs, not in a public response.
 */
export const dynamic = "force-dynamic";

type ComponentState = "up" | "down" | "not_configured";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("check") === "deep";

  // Liveness: the process is running and can execute code. Nothing else.
  if (!deep) {
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();

  /**
   * Timeouts on every dependency check.
   *
   * Without one, an unreachable database makes the health check hang until the
   * connection times out -- and a probe that hangs reads as "unhealthy" to some
   * orchestrators and "still checking" to others. A bounded answer is always
   * better than an accurate one that arrives too late to be useful.
   */
  const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const [database, redis] = await Promise.all([
    withTimeout(
      // SELECT 1 rather than a table read: it proves the connection works
      // without depending on any schema, so it keeps working mid-migration.
      db.$queryRaw`SELECT 1`.then((): ComponentState => "up").catch((): ComponentState => "down"),
      2_000,
    ),
    (async (): Promise<ComponentState> => {
      if (!isRedisConfigured()) return "not_configured";
      const client = getRedis();
      if (!client) return "not_configured";
      const pinged = await withTimeout(
        client.ping().then(() => true).catch(() => false),
        1_000,
      );
      return pinged ? "up" : "down";
    })(),
  ]);

  const components = {
    database: database ?? "down",
    redis,
  };

  /**
   * Redis being down does NOT make the app unready: rate limiting degrades to
   * the in-memory limiter and everything else keeps working. Reporting unready
   * for a degraded optional dependency would pull healthy instances out of
   * rotation for no reason.
   *
   * The database being down does, because there is no page worth serving
   * without it.
   */
  const ready = components.database === "up";

  if (!ready) {
    logger.warn("health check reports not ready", {
      route: "/api/health",
      ...components,
      ms: Date.now() - started,
    });
  }

  return Response.json(
    { status: ready ? "ok" : "degraded", components },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
