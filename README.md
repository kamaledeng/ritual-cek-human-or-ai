# Ritual — Cek Human atau AI

Aplikasi sederhana untuk mengecek **probabilitas** teks tweet “lebih mirip AI atau manusia” menggunakan **Mistral API**.

Catatan penting: hasilnya *bukan kepastian 100%*. Ini hanya analisis probabilistik dari teks.

## Jalanin lokal

1. Install dependencies

```bash
npm install
```

2. Set env

- Copy `.env.example` jadi `.env.local`
- Isi `MISTRAL_API_KEY` (jangan pernah commit key asli)

3. Run dev server

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Deploy ke Vercel

1. Import repo ini di Vercel
2. Set Environment Variables:
   - `MISTRAL_API_KEY` = API key dari Mistral
   - (opsional) `MISTRAL_MODEL` = `mistral-small-latest`
3. Deploy

## Endpoint

- `POST /api/analyze`

Body:

```json
{
  "tweet_url": "https://x.com/.../status/123",
  "text": "paste teks tweet"
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
