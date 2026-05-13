# Ritual — Human or AI Checker

A tiny Next.js app that estimates whether a tweet-like text is **more likely written by a human or by AI**, using the **Mistral API**.

Important: the output is **probabilistic** and not 100% proof.

## Run locally

1. Install dependencies

```bash
npm install
```

2. Set env

- Copy `.env.example` to `.env.local`
- Fill `MISTRAL_API_KEY` (never commit real keys)
- (recommended) Pin `MISTRAL_MODEL` to a fixed model name for long-term stability (avoid `*-latest`)
- (optional) Adjust request limits: `MAX_TEXT_CHARS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SEC`

3. Start dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Vercel

1. Import this repo into Vercel
2. Add Environment Variables:
   - `MISTRAL_API_KEY` = your Mistral API key
   - (recommended) `MISTRAL_MODEL` = a fixed model name (avoid `*-latest` if you want consistent results)
   - (optional) `MAX_TEXT_CHARS` = `10000`
   - (optional) `RATE_LIMIT_MAX` = `30`
   - (optional) `RATE_LIMIT_WINDOW_SEC` = `60`
   - (optional) `NEXT_PUBLIC_MAX_TEXT_CHARS` = `10000` (textarea limit)
3. Deploy

## API endpoint

- `POST /api/analyze`

Request body:

```json
{
  "tweet_url": "https://x.com/.../status/123",
  "text": "paste the text here"
}
```

Response:

```json
{
  "ai_likelihood": 0,
  "label": "uncertain",
  "reasons": ["..."],
  "suggested_checks": ["..."],
  "model": "mistral-small-latest"
}
```
