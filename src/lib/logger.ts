/**
 * Structured logging.
 *
 * WHY NOT console.log
 * `console.error("summarize failed:", error)` is fine on your laptop and nearly
 * useless in production. A log platform can only filter, alert and aggregate on
 * FIELDS -- so a line has to be a machine-readable object, not a sentence with
 * values interpolated into it. "Show me every rate-limit rejection for user X in
 * the last hour" is a query against fields; against prose it is a regex someone
 * maintains by hand.
 *
 * WHY NOT pino or winston
 * They are good libraries, and this project's rule is that every dependency
 * needs a reason. What we actually need is: JSON to stdout, levels, and a
 * context object. That is the code below. The moment we need transports, sampling
 * or redaction rules, pino earns its place -- and because every call site goes
 * through this module, swapping it is one file.
 *
 * SERVER ONLY
 * This writes to process.stdout/stderr, which do not exist in a browser. Never
 * import it into a Client Component -- that is both a runtime error and, worse,
 * a bundle that pulls server code toward the client. Client-side diagnostics
 * stay on console.*, which is what browser devtools reads anyway.
 *
 * WHY stdout
 * In a container, stdout IS the log pipeline. Writing to files means log
 * rotation, disk pressure and a volume mount; the platform already collects
 * stdout. This is the twelve-factor position and it is right.
 */

type Level = "debug" | "info" | "warn" | "error";

/** Anything JSON-serialisable. Deliberately not `any`. */
type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value };
export type LogContext = Record<string, Value>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Below this, nothing is emitted. Default: debug locally, info in production --
 * debug logs in production are mostly cost and noise, but they are one env var
 * away when something needs investigating.
 */
const threshold =
  LEVELS[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ??
  LEVELS.info;

/**
 * Keys whose values are replaced before they reach a log line.
 *
 * Logs get shipped to third parties, retained for months, and read by people who
 * were never meant to see a session token. The safest design is to never rely on
 * remembering: redaction happens here, once, for every call site.
 */
const REDACT = new Set([
  "password",
  "passwordhash",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "sessiontoken",
  "anthropic_api_key",
  "database_url",
  "auth_secret",
  "redis_url",
]);

function redact(value: Value, depth = 0): Value {
  // Bounded depth: a cyclic or pathologically nested object must not hang the
  // logger, and a log line is not the place for a 12-level structure anyway.
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Value } = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = REDACT.has(key.toLowerCase()) ? "[redacted]" : redact(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Errors do not survive JSON.stringify -- `JSON.stringify(new Error("x"))` is
 * "{}", which is how a stack trace silently disappears from your logs.
 */
/** Picks up status/code from SDK error subclasses without asserting a false shape. */
function extraErrorFields(error: Error): LogContext {
  const bag = error as unknown as Record<string, unknown>;
  const fields: LogContext = {};
  if (bag.status !== undefined) fields.status = String(bag.status);
  if (bag.code !== undefined) fields.code = String(bag.code);
  return fields;
}

function serialiseError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Stack only outside production by default: it is large, and in a
      // structured platform the message plus a source map is usually enough.
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
      // Anthropic and Prisma errors carry useful fields that are not on Error --
      // an HTTP status, a Prisma code like P2002. Read through Record<string,
      // unknown> rather than asserting a shape Error does not have.
      ...extraErrorFields(error),
    };
  }
  return { message: String(error) };
}

function emit(level: Level, message: string, context?: LogContext) {
  if (LEVELS[level] < threshold) return;

  const line = {
    // ISO first so a human tailing the log can read it, and every platform
    // parses it as a timestamp without configuration.
    time: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as LogContext) : {}),
  };

  // One line per record, always. A pretty-printed multi-line object gets split
  // into separate records by every log collector.
  const serialised = JSON.stringify(line);

  // stderr for warn and above so the two streams can be routed differently.
  if (LEVELS[level] >= LEVELS.warn) {
    process.stderr.write(`${serialised}\n`);
  } else {
    process.stdout.write(`${serialised}\n`);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),

  /**
   * Takes the error as a distinct argument rather than leaving callers to
   * remember to serialise it -- which is exactly the step people skip.
   */
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit("error", message, { ...context, ...(error !== undefined ? { err: serialiseError(error) } : {}) }),

  /**
   * A logger with fields pre-attached, so a request id or user id does not have
   * to be threaded through every call in a handler.
   */
  child(bound: LogContext) {
    return {
      debug: (message: string, context?: LogContext) => emit("debug", message, { ...bound, ...context }),
      info: (message: string, context?: LogContext) => emit("info", message, { ...bound, ...context }),
      warn: (message: string, context?: LogContext) => emit("warn", message, { ...bound, ...context }),
      error: (message: string, error?: unknown, context?: LogContext) =>
        emit("error", message, {
          ...bound,
          ...context,
          ...(error !== undefined ? { err: serialiseError(error) } : {}),
        }),
    };
  },
};

export type Logger = ReturnType<typeof logger.child>;
