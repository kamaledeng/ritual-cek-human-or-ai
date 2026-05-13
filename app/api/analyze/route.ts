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

type MistralChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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
      { error: "Server is not configured: MISTRAL_API_KEY is not set." },
      { status: 500 }
    );
  }

  let body: AnalyzeRequestBody | null = null;
  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = (body?.text ?? "").trim();
  const tweetUrl = (body?.tweet_url ?? "").trim();

  if (!text) {
    return NextResponse.json(
      { error: "Field 'text' is required." },
      { status: 400 }
    );
  }

  // Force the model to return raw JSON (no markdown).
  const system = [
    "You are a text forensics assistant.",
    "Task: estimate whether the following text is more likely written by a human or by AI.",
    "You MUST output valid JSON only (no markdown, no extra text).",
    "Score meaning: 0 = very likely human, 100 = very likely AI.",
    'Use label: "likely_human", "likely_ai", or "uncertain".',
    "Provide 3-6 reasons and 3-6 suggested verification checks.",
  ].join("\n");

  const user = [
    tweetUrl ? `Source (optional): ${tweetUrl}` : "",
    "Text to analyze:",
    text,
    "",
    "Output format (JSON):",
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
      // Make responses as stable as possible across repeated requests.
      temperature: 0,
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
          "Failed to call Mistral API. Check your API key, rate limits, and selected model.",
        detail: errorText?.slice(0, 2000) || undefined,
      },
      { status: 502 }
    );
  }

  const payload = (await upstream.json()) as MistralChatCompletionResponse;
  const content: string | undefined = payload?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "Unexpected response format from Mistral." },
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
      "Not enough strong indicators from text alone; additional context is needed.",
    ];
  }
  if (!result.suggested_checks.length) {
    result.suggested_checks = [
      "Compare with the author's writing style across other posts.",
      "Ask for creation proof (drafts, notes, sources, timestamps).",
    ];
  }

  return NextResponse.json(result);
}
