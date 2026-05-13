"use client";

import { useMemo, useState } from "react";

type AnalyzeResult = {
  ai_likelihood: number; // 0-100
  label: "likely_ai" | "likely_human" | "uncertain";
  reasons: string[];
  suggested_checks: string[];
  model?: string;
};

function labelToText(label: AnalyzeResult["label"]) {
  switch (label) {
    case "likely_ai":
      return "Likely AI";
    case "likely_human":
      return "Likely Human";
    default:
      return "Uncertain";
  }
}

function labelClasses(label: AnalyzeResult["label"]) {
  switch (label) {
    case "likely_ai":
      return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200";
    case "likely_human":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200";
  }
}

export default function Home() {
  const [tweetUrl, setTweetUrl] = useState("");
  const [tweetText, setTweetText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const canSubmit = useMemo(() => tweetText.trim().length > 0, [tweetText]);

  async function onSubmit() {
    setError(null);
    setResult(null);

    if (!canSubmit) {
      setError("Please paste the text first.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tweet_url: tweetUrl.trim() || undefined,
          text: tweetText.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data && (data.error as string)) ||
            `Request failed (HTTP ${res.status}).`
        );
        return;
      }

      setResult(data as AnalyzeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ritual — Human or AI Checker
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Paste a tweet-like text (optionally include its X/Twitter URL) to get an{" "}
            <span className="font-medium">estimate</span> of whether it is more likely
            written by a human or by AI. Results are probabilistic, not 100% proof.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Tweet URL (optional)</span>
              <input
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="https://x.com/.../status/123"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-700"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Text</span>
              <textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                rows={7}
                placeholder="Paste the text here…"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-700"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Note: this app does not fetch tweet content from X automatically (API access is limited),
                so please paste the text manually.
              </span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onSubmit}
                disabled={!canSubmit || loading}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {loading ? "Analyzing…" : "Analyze"}
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Your Mistral API key is stored server-side (env) and never exposed in the browser.
              </p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {result ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Result</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Model: {result.model ?? "mistral-small-latest"}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${labelClasses(
                          result.label
                        )}`}
                      >
                        {labelToText(result.label)}
                      </span>
                      <span className="text-sm">
                        <span className="font-medium">AI likelihood:</span>{" "}
                        <span className="tabular-nums">
                          {result.ai_likelihood}
                        </span>
                        /100
                      </span>
                    </div>
                    <div className="w-full sm:w-64">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-50"
                          style={{ width: `${Math.max(0, Math.min(100, result.ai_likelihood))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {tweetUrl.trim() ? (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    Source:{" "}
                    <a
                      className="underline"
                      href={tweetUrl.trim()}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tweetUrl.trim()}
                    </a>
                  </p>
                ) : null}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Key reasons</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-200">
                      {result.reasons?.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Suggested checks</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-200">
                      {result.suggested_checks?.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          Disclaimer: this is probabilistic analysis. For higher confidence, you
          need additional context (author history, source material, creation
          proof, etc.).
        </footer>
      </main>
    </div>
  );
}
