"use client";

import { useMemo, useState } from "react";

type AnalyzeResult = {
  ai_likelihood: number; // 0-100
  label: "likely_ai" | "likely_human" | "uncertain";
  reasons: string[];
  suggested_checks: string[];
  model?: string;
};

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
      setError("Masukkan teks tweet dulu ya.");
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
            `Gagal memproses (HTTP ${res.status}).`
        );
        return;
      }

      setResult(data as AnalyzeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ritual — Cek Human atau AI
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Masukkan teks tweet (dari link X/Twitter) lalu dapatkan{" "}
            <span className="font-medium">perkiraan</span> apakah teksnya
            terindikasi dibuat AI atau manusia. Hasilnya berupa skor + alasan,
            bukan kepastian 100%.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Link tweet (opsional)</span>
              <input
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="https://x.com/.../status/123"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-700"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Teks tweet</span>
              <textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                rows={7}
                placeholder="Paste teks tweet di sini…"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-700"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Catatan: versi gratis biasanya tidak bisa ambil isi tweet otomatis
                dari link (karena batasan X). Jadi paste teksnya ya.
              </span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onSubmit}
                disabled={!canSubmit || loading}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {loading ? "Memproses…" : "Cek sekarang"}
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                API key Mistral disimpan di server (env), tidak muncul di browser.
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
                    <p className="text-sm font-medium">Hasil</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Model: {result.model ?? "mistral-small-latest"}
                    </p>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Skor AI:</span>{" "}
                    <span className="tabular-nums">{result.ai_likelihood}</span>
                    /100 •{" "}
                    <span className="font-medium">Label:</span> {result.label}
                  </div>
                </div>

                {tweetUrl.trim() ? (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    Sumber:{" "}
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
                    <p className="text-sm font-medium">Alasan utama</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-200">
                      {result.reasons?.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Saran verifikasi</p>
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
          Disclaimer: ini hanya analisis probabilistik. Untuk kepastian, perlu
          konteks tambahan (sumber, histori akun, bukti proses pembuatan, dsb).
        </footer>
      </main>
    </div>
  );
}
