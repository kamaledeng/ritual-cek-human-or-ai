import { NextResponse } from "next/server";

type AnalyzeRequestBody = {
  text?: string;
  tweet_url?: string;
};

type AnalyzeResult = {
  ai_likelihood: number; // 0-100
  label: "likely_ai" | "likely_human" | "uncertain";
  reasons: string[];
  suggested_checks: string[];
  model?: string;
};

function clamp0to100(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL ?? "mistral-small-latest";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Server belum dikonfigurasi: MISTRAL_API_KEY belum diset." },
      { status: 500 }
    );
  }

  let body: AnalyzeRequestBody | null = null;
  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  const text = (body?.text ?? "").trim();
  const tweetUrl = (body?.tweet_url ?? "").trim();

  if (!text) {
    return NextResponse.json(
      { error: "Field 'text' wajib diisi." },
      { status: 400 }
    );
  }

  // Prompt dibuat supaya model mengembalikan JSON murni, tanpa markdown.
  const system = [
    "Kamu adalah asisten forensik teks.",
    "Tugas: menilai apakah teks berikut lebih mungkin ditulis manusia atau AI.",
    "Kamu HARUS mengembalikan JSON valid saja (tanpa markdown, tanpa teks lain).",
    "Skor 0 = sangat mungkin manusia, 100 = sangat mungkin AI.",
    'Gunakan label: "likely_human", "likely_ai", atau "uncertain".',
    "Berikan 3-6 alasan dan 3-6 saran verifikasi.",
  ].join("\n");

  const user = [
    tweetUrl ? `Sumber (opsional): ${tweetUrl}` : "",
    "Teks yang dianalisis:",
    text,
    "",
    "Format output (JSON):",
    "{",
    '  "ai_likelihood": 0,',
    '  "label": "uncertain",',
    '  "reasons": ["..."],',
    '  "suggested_checks": ["..."]',
    "}",
  ]
    .filter(Boolean)
    .join("\n");

  const upstream = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error:
          "Gagal memanggil Mistral API. Cek API key / limit / model yang dipakai.",
        detail: errorText?.slice(0, 2000) || undefined,
      },
      { status: 502 }
    );
  }

  const payload = (await upstream.json()) as any;
  const content: string | undefined = payload?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "Respons Mistral tidak sesuai format yang diharapkan." },
      { status: 502 }
    );
  }

  // Coba parse JSON dari model. Kalau gagal, fallback ke hasil default.
  const parsed = safeJsonParse<AnalyzeResult>(content.trim());

  const result: AnalyzeResult = {
    ai_likelihood: clamp0to100(parsed?.ai_likelihood ?? 50),
    label: parsed?.label ?? "uncertain",
    reasons: Array.isArray(parsed?.reasons) ? parsed!.reasons.slice(0, 8) : [],
    suggested_checks: Array.isArray(parsed?.suggested_checks)
      ? parsed!.suggested_checks.slice(0, 8)
      : [],
    model,
  };

  // Minimal hygiene: pastikan ada isi.
  if (!result.reasons.length) {
    result.reasons = [
      "Tidak ada cukup indikator kuat dari teks saja; perlu konteks tambahan.",
    ];
  }
  if (!result.suggested_checks.length) {
    result.suggested_checks = [
      "Bandingkan dengan gaya tulisan akun dari postingan lain.",
      "Minta bukti proses pembuatan (draft, rekaman, sumber referensi).",
    ];
  }

  return NextResponse.json(result);
}

