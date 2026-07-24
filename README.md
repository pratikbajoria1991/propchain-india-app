# PropChain India — scroll-world landing

Cinematic scroll-scrubbed landing page for PropChain India (fractional, on-chain
Indian real estate) plus a small full-stack layer: live property listings and a
waitlist API.

Built on the [scroll-world](https://github.com/oso95/scroll-world) scrub engine
(vanilla JS, zero dependencies). As you scroll, the camera flies Marine Drive →
a rising Lower Parel tower → your future living room, with copy, section nav and
a working invest modal.

## Run locally

```bash
node server.js          # → http://localhost:5890
```

No dependencies to install. The dev server serves `public/` and routes
`/api/*` to the same handler modules Vercel deploys as serverless functions.

## Deploy to Vercel

```bash
npx vercel deploy       # preview
npx vercel --prod       # production
```

`vercel.json` is already configured: static site from `public/`, functions from
`api/`, immutable caching for `assets/`.

**Production note:** `api/waitlist.js` appends to `data/waitlist.json`, which is
ephemeral on serverless. Before launch, swap `persist()` for Vercel KV,
Postgres, or a CRM webhook — it's a one-function change.

## Structure

```
propchain-app/
├── public/               static site (served as-is)
│   ├── index.html        page + engine config + invest modal
│   ├── scrub-engine.js   scroll-world scrub engine (unmodified)
│   └── assets/           posters, photos, fonts, vid/ (desktop + -m mobile clips)
├── api/
│   ├── properties.js     GET  /api/properties — live listings JSON
│   └── waitlist.js       POST /api/waitlist  — email capture
├── server.js             zero-dep local dev server
└── vercel.json           deploy config
```

## Asset pipeline

Scene clips are generated from real photography (Pexels, free license):

- The City — Marine Drive, Mumbai at night: pexels.com/photo/33948766
- The Tower — Lower Parel towers at dusk: pexels.com/photo/31713110
- Your Stake — evening living room: pexels.com/photo/7045915

Each photo is cropped to 16:9, graded (contrast/saturation lift + vignette),
turned into a 4 s zoom "dive" (1080p, keyframe every 4 frames for smooth
scrubbing) plus 720p mobile encodes. Connectors are frame-locked: built from
the actual last/first frames of the neighbouring dives so seams are invisible.
To regenerate or add scenes, follow the same ffmpeg recipe in the project
history, or run the full scroll-world skill with Higgsfield for generated
worlds.
