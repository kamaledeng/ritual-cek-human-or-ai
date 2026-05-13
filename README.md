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

3. Start dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Vercel

1. Import this repo into Vercel
2. Add Environment Variables:
   - `MISTRAL_API_KEY` = your Mistral API key
   - (optional) `MISTRAL_MODEL` = `mistral-small-latest`
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
