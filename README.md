# The Deck

A personal CRM for the people you keep meaning to invite out. Mobile-first, list-only, single user.

## What it tracks

- Last invited, total asks, and accept rate
- A Rat Chat yes/no (🐀 shows on the row when yes)
- One short note per person, plus a phone number
- Up to six photos each — pulled from Instagram or added by hand
- Every ask with an outcome: waiting / yes / no / ghosted, and the date it happened

## The list

- Default sort is **Coldest** — whoever you've left hanging longest floats to the top
- The emoji strip is the last five asks, newest on the right: ✅ yes · ⏳ waiting · ❌ no · 👻 ghosted
- Tap the header count to open a stats panel: hit rate, gone cold, typical gap, and asks per week over 12 weeks

## Setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill it in
3. Run `supabase/schema.sql` in the Supabase SQL editor
4. Create a **public** Storage bucket named `avatars` from the dashboard
5. `npm run dev`

### Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser-side reads and writes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side only — caches photos into Storage |
| `ROLODECK_PIN` | yes in production | The app's PIN. Unset locally = no lock |
| `GOOGLE_PLACES_API_KEY` | no | Venue autocomplete on the invite field |

## The PIN lock

The whole app sits behind a four-digit PIN. Middleware gates every route and API;
the unlock cookie is a SHA-256 of the PIN, httpOnly, and expires after **five idle
minutes**, sliding forward while you're using it. The tab also locks itself after
five minutes of no interaction. Removing someone asks for the PIN again.

**Deployed with `ROLODECK_PIN` unset, the app returns 503 rather than serving.**
That's deliberate: without it, both the app and `/api/upload` — which writes to
Storage with the service role — would be wide open.

## Photos

Tap the avatar to upload one. The six-square grid below fills from Instagram, or
from your camera roll when there's no account to pull from.

Instagram is scraped, not APIed: `/api/ig` resolves the avatar via unavatar with an
`og:image` fallback, and reads the recent grid off the public profile endpoint. Both
get copied into your own Storage bucket, because Instagram's CDN links expire and
only answer the client that requested them. Grids re-sync weekly in the background.

That endpoint is undocumented and rate-limited by IP. When it throttles you the app
says so plainly instead of showing an empty grid, and it never overwrites photos you
already have with nothing.

## Saving

There is no save button. Edits settle for ~700ms and persist themselves.

## Security notes

RLS is **off** on `people` and `invites` — this is a single-user app with no login,
so the anon key alone can read and write them. The PIN is what protects the data, so
don't deploy without it. `/api/places` keeps the Google key server-side because a
`NEXT_PUBLIC_` one would ship to every browser and Google bills per call.

## Deploy

Vercel plus your Supabase project. Set all five env vars.
