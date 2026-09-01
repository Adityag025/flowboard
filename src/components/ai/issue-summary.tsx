"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "idle" | "streaming" | "error";

/**
 * Consumes the streaming summarize endpoint.
 *
 * Note there is no useActionState here -- this is plain fetch, because the
 * response arrives progressively and a Server Action cannot do that. The state
 * machine is deliberately explicit: `idle` also covers "finished", since a
 * finished summary and a cached one look the same to the reader.
 */
export function IssueSummary({
  issueId,
  cachedSummary,
  aiConfigured,
}: {
  issueId: string;
  cachedSummary: string | null;
  aiConfigured: boolean;
}) {
  const [text, setText] = useState(cachedSummary ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [wasCached, setWasCached] = useState(Boolean(cachedSummary));

  const abortRef = useRef<AbortController | null>(null);

  /**
   * Abort an in-flight stream if the component unmounts.
   *
   * Without this, navigating away mid-summary leaves the fetch running and its
   * reader loop calling setState on an unmounted component -- and the server
   * keeps generating tokens nobody will read, which is money spent on nothing.
   */
  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setError(null);
    setText("");
    setWasCached(false);

    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Request failed (${response.status})`);
        setStatus("error");
        return;
      }

      setWasCached(response.headers.get("X-Summary-Cached") === "hit");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true matters -- a multi-byte character split across two
        // chunks would otherwise decode as a replacement character.
        accumulated += decoder.decode(value, { stream: true });
        setText(accumulated);
      }

      setStatus("idle");
    } catch (caught) {
      // An abort is us, not a failure -- do not show the user an error for it.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Could not reach the server.");
      setStatus("error");
    }
  }

  if (!aiConfigured) {
    return (
      <div className="rounded-md border border-dashed border-border p-3">
        <p className="text-xs text-muted">
          AI summaries need <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
          in <code className="font-mono">.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Sparkles className="size-3.5" aria-hidden="true" />
          AI summary
          {wasCached && text && (
            <span className="font-normal opacity-70">(cached)</span>
          )}
        </h3>
        <Button
          variant="secondary"
          onClick={generate}
          disabled={status === "streaming"}
          className="h-7 px-2 text-xs"
        >
          {status === "streaming"
            ? "Summarizing..."
            : text
              ? "Regenerate"
              : "Summarize"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}

      {text ? (
        <p
          // aria-live so a screen reader announces the text as it arrives
          // rather than leaving the region silent until it happens to be read.
          aria-live="polite"
          className={cn(
            "prose-face whitespace-pre-wrap text-xs text-muted",
            status === "streaming" && "after:animate-pulse after:content-['▍']",
          )}
        >
          {text}
        </p>
      ) : (
        status !== "streaming" &&
        !error && (
          <p className="text-xs text-muted opacity-70">
            Summarize the issue and its comments.
          </p>
        )
      )}
    </div>
  );
}
