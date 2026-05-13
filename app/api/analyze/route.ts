import { NextResponse } from "next/server";
import crypto from "crypto";

type AnalyzeRequestBody = {
  text?: string;
  tweet_url?: string;
  force?: boolean;
};

type AnalyzeResult = {
  ai_likelihood: number; // 0-100
  label: "likely_ai" | "likely_human" | "uncertain";
  reasons: string[];
  suggested_checks: string[];
  model?: string;
  confidence?: number; // 0-100 (optional; higher = more confident)
  confidence_category?: "low" | "medium" | "high";
};

type MistralChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type AnalyzeModelOutput = {
  ai_likelihood?: number;
  label?: AnalyzeResult["label"];
  reasons?: unknown;
  suggested_checks?: unknown;
  confidence?: number;
  confidence_category?: AnalyzeResult["confidence_category"];
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

function extractFirstJsonObject(text: string): string | null {
  // Extract the first {...} block (best-effort) in case the model adds extra text.
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function getClientIp(req: Request): string {
  // Best-effort: works behind most proxies (Vercel, etc.)
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

type RateLimitEntry = { count: number; resetAt: number };

function getRateLimitConfig() {
  const windowSec = Number(process.env.RATE_LIMIT_WINDOW_SEC ?? "60");
  const max = Number(process.env.RATE_LIMIT_MAX ?? "30");
  return {
    windowMs:
      Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
    max: Number.isFinite(max) && max > 0 ? max : 30,
  };
}

function checkRateLimit(ip: string) {
  const { windowMs, max } = getRateLimitConfig();
  const now = Date.now();

  const g = globalThis as unknown as {
    __ritualRateLimit?: Map<string, RateLimitEntry>;
  };
  if (!g.__ritualRateLimit) g.__ritualRateLimit = new Map();

  const entry = g.__ritualRateLimit.get(ip);
  if (!entry || entry.resetAt <= now) {
    g.__ritualRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  g.__ritualRateLimit.set(ip, entry);
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

type CacheEntry = { result: AnalyzeResult; expiresAt: number };

function getCacheConfig() {
  const ttlSec = Number(process.env.CACHE_TTL_SEC ?? "3600");
  const maxEntries = Number(process.env.CACHE_MAX_ENTRIES ?? "500");
  const enabled = (process.env.ENABLE_SERVER_CACHE ?? "true").toLowerCase() !== "false";
  return {
    enabled,
    ttlMs: Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec * 1000 : 3600_000,
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : 500,
  };
}

function getCache() {
  const g = globalThis as unknown as { __ritualCache?: Map<string, CacheEntry> };
  if (!g.__ritualCache) g.__ritualCache = new Map();
  return g.__ritualCache;
}

function cacheKey(parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

function cacheGet(key: string): AnalyzeResult | null {
  const { enabled } = getCacheConfig();
  if (!enabled) return null;
  const cache = getCache();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: AnalyzeResult) {
  const { enabled, ttlMs, maxEntries } = getCacheConfig();
  if (!enabled) return;
  const cache = getCache();
  if (cache.size >= maxEntries) {
    // Evict oldest (Map keeps insertion order)
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

export async function POST(req: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL ?? "mistral-small-latest";
  const maxTextChars = Number(process.env.MAX_TEXT_CHARS ?? "10000");

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
  const force = Boolean(body?.force);

  if (!text) {
    return NextResponse.json(
      { error: "Field 'text' is required." },
      { status: 400 }
    );
  }

  if (Number.isFinite(maxTextChars) && maxTextChars > 0 && text.length > maxTextChars) {
    return NextResponse.json(
      { error: `Text is too long (max ${maxTextChars} characters).` },
      { status: 413 }
    );
  }

  // Basic abuse protection (best-effort in-memory limiter; for stronger protection use KV/Redis).
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  const promptVersion = "v2-conservative-json"; // bump if prompt/output schema changes
  const key = cacheKey([promptVersion, model, tweetUrl, text]);
  if (!force) {
    const cached = cacheGet(key);
    if (cached) return NextResponse.json(cached);
  }

  // Force the model to return raw JSON (no markdown).
  const system = [
    "You are a text forensics assistant.",
    "Task: estimate whether the following text is more likely written by a human or by AI.",
    "You MUST output valid JSON only (no markdown, no extra text).",
    "Score meaning: 0 = very likely human, 100 = very likely AI.",
    'Use label: "likely_human", "likely_ai", or "uncertain".',
    "Provide 3-6 reasons and 3-6 suggested verification checks.",
    "",
    "Be conservative: false positives are harmful.",
    "Only use 'likely_ai' or 'likely_human' when there are strong indicators in the text itself.",
    "If evidence is weak, return label 'uncertain' and keep ai_likelihood near 50.",
    "Also output a confidence score (0-100) and confidence_category ('low'|'medium'|'high').",
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
    '  "confidence": 0,',
    '  "confidence_category": "low",',
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
  const trimmed = content.trim();
  const jsonOnly = safeJsonParse<AnalyzeModelOutput>(trimmed)
    ? trimmed
    : extractFirstJsonObject(trimmed) ?? trimmed;
  const parsed = safeJsonParse<AnalyzeModelOutput>(jsonOnly);

  const rawScore = clamp0to100(Number(parsed?.ai_likelihood ?? 50));
  const rawConfidence = clamp0to100(
    Number(parsed?.confidence ?? Math.abs(rawScore - 50) * 2)
  );

  // If confidence is low, pull score towards 50 to reduce false positives.
  const adjustedScore = clamp0to100(
    50 + (rawScore - 50) * (rawConfidence / 100)
  );

  const labelFromScore = (score: number, confidence: number): AnalyzeResult["label"] => {
    if (confidence < 55) return "uncertain";
    if (score >= 65) return "likely_ai";
    if (score <= 35) return "likely_human";
    return "uncertain";
  };

  const confidenceCategory: AnalyzeResult["confidence_category"] =
    rawConfidence >= 80 ? "high" : rawConfidence >= 55 ? "medium" : "low";

  const result: AnalyzeResult = {
    ai_likelihood: adjustedScore,
    label: labelFromScore(adjustedScore, rawConfidence),
    reasons: Array.isArray(parsed?.reasons)
      ? (parsed!.reasons as string[]).slice(0, 8)
      : [],
    suggested_checks: Array.isArray(parsed?.suggested_checks)
      ? (parsed!.suggested_checks as string[]).slice(0, 8)
      : [],
    confidence: rawConfidence,
    confidence_category: confidenceCategory,
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

  cacheSet(key, result);
  return NextResponse.json(result);
}
