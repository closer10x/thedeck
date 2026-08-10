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
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side only — the sole database credential |
| `ROLODECK_USERS` | yes in production | Who can get in: `Jon:1982,Carlos:1980`. Unset locally = no lock |
| `GOOGLE_PLACES_API_KEY` | no | Venue autocomplete on the invite field |
| `IG_SESSIONID` | no | `sessionid` cookie from a logged-in Instagram browser. Without it, deployed photo pulls hit a login wall |

There is no anon key. The browser holds no database credential at all.

`ROLODECK_PIN` from before still works and signs you in as a single user called
Owner, but it's superseded by `ROLODECK_USERS`.

## The PIN lock

The whole app sits behind a four-digit PIN, and **each PIN belongs to a person**.
The PIN is the identity — there's no name to pick on the way in, so nobody can
pick the wrong one, and everything you do is written down under that name.

Middleware gates every route and API. The unlock cookie is `name.hash`, where the
hash is a SHA-256 of that person's PIN salted with their name: a cookie edited to
claim someone else stops verifying. It's httpOnly and expires after **five idle
minutes**, sliding forward while you're using it. The tab also locks itself after
five minutes of no interaction. Removing someone asks for **your own** PIN again —
the other person's won't do, or the deletion would land in the log under your name.

Hand the phone over with **Sign out** in the header menu, so his asks are his.

**Deployed with no users configured, the app returns 503 rather than serving.**
That's deliberate: without it, both the app and `/api/upload` — which writes to
Storage with the service role — would be wide open. Two people sharing a PIN, or
a malformed `ROLODECK_USERS`, is refused the same way rather than guessed at.

## Events

A "yes" is supposed to turn into something. The **Events** tab — the other half
of the pill under the title — is where it does: make an event, put people on it,
and afterwards record who actually turned up.

Each guest carries a status: **coming**, **maybe**, and then **came** or
**no show** once the night has happened. That last pair is the part worth having
— a yes that didn't show is not the same as a yes.

The guest picker lists the deck with **whoever said yes most recently first**,
tagged so you can see why she's at the top. Events with no date are legal and
sort as upcoming; a plan without a day is still a plan. Everything is logged
against the person as well as the event, so "Added Ashley C. to Rooftop dinner"
shows up in her own history too, and her sheet lists what she's on.

Existing databases need `supabase/events.sql` run once in the SQL editor. Until
then the tab says so and refuses to make an event it couldn't save.

## The log

Every write is recorded in the `activity` table under the name of whoever's PIN
signed in: adding, editing, archiving and deleting people, asks and their outcomes
and notes, photo uploads, and signing in and out. Read the whole thing from the
header chip, or one person's from the History link in her sheet. Asks show
**Logged by**, and people show who added them.

Edits are diffed against the stored row before anything is written, so autosave
posting an unchanged row logs nothing and each entry names the fields that actually
changed. Photos are logged at the upload rather than at the row write — the weekly
Instagram re-sync touches the same columns with nobody behind it.

It's append-only: nothing in the app edits or deletes an entry, there is no route
that could, and deleting someone keeps the record that she existed.

Existing databases need `supabase/activity-log.sql` run once in the SQL editor.
Until that happens the app works normally and the panel says what's missing.

## Photos

Tap the avatar to upload one. The six-square grid below fills from Instagram, or
from your camera roll when there's no account to pull from.

Instagram is scraped, not APIed: `/api/ig` tries the avatar in three places —
unavatar, the profile JSON, then the page's `og:image` — and reads the recent grid
off the public profile endpoint. Both get copied into your own Storage bucket,
because Instagram's CDN links expire and only answer the client that requested
them. Grids re-sync weekly in the background.

That endpoint is undocumented and rate-limited by IP. When it throttles you the app
says so plainly instead of showing an empty grid, and it never overwrites photos you
already have with nothing.

**Logged out, Instagram shows a datacenter IP a login wall**, which is what
deployed pulls usually hit. Set `IG_SESSIONID` to the `sessionid` cookie from a
browser you're logged into and the pull works from the server too. Use a throwaway
account: the cookie is that account's login, and it expires on sign-out.

The wall's tell is that it answers "please wait a few minutes" — the same words
real throttling uses, except it says them to every request forever. So that
wording is only believed when a session is set. Logged out it's reported as the
block it is, because "try again shortly" is advice that never comes good.

A pull that comes back empty is careful about saying why. "No account by that
handle" only appears when something actually looked her up and didn't find her — a
404 from the profile endpoint, or a profile page that rendered and didn't know the
name. A wall or a throttle proves nothing about whether she exists, and says so
instead, because the useful next move there is to wait or set a session, not to go
hunting for a typo in a handle that was fine.

## Saving

There is no save button. Edits settle for ~700ms and persist themselves.

## Security notes

**The browser never talks to Supabase.** Every read and write goes through
`/api/data`, `/api/people`, and `/api/invites`, which use the service role and sit
behind the PIN gate in `middleware.js`. RLS is **on** for `people`, `invites` and `activity`
with **no policies at all** — that denies `anon` and `authenticated` outright, and
the service role bypasses RLS by design. So there is no key in the client bundle
worth stealing, and pulling one wouldn't help: the tables reject it.

Verified rather than assumed — with the old anon key, `select` returns `[]` and
`insert` fails with `42501 new row violates row-level security policy`.

`/api/places` keeps the Google key server-side too, because a `NEXT_PUBLIC_` one
would ship to every browser and Google bills per call.

Still open: the `avatars` Storage bucket is public, so anyone holding a photo URL
can load it, and paths are partly guessable (`ig/<handle>/<shortcode>.jpg`). The
photos are already public on Instagram, but uploads from your camera roll are not.
Making the bucket private and signing URLs would close that.

## Deploy

Vercel plus your Supabase project. Set all five env vars.
