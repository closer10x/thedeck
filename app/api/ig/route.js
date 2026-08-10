import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { parseHandle } from '../../../lib/format';

export const runtime = 'nodejs';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Instagram serves logged-out requests from datacenter IPs a login wall, which
// is why a pull that works on your phone comes back empty from the server. A
// session cookie is the only thing that lifts it. Optional — without it the
// anonymous path still works from friendlier IPs, it just fails more often.
// Paste the `sessionid` cookie from a logged-in browser into IG_SESSIONID.
const SESSION = (process.env.IG_SESSIONID || '').trim();

function igHeaders(handle, extra = {}) {
  const h = { 'user-agent': UA, ...extra };
  if (SESSION) h.cookie = `sessionid=${SESSION}`;
  return h;
}

// 1) unavatar resolves most public IG avatars without an API key
async function fromUnavatar(handle) {
  const r = await fetch(`https://unavatar.io/instagram/${handle}?fallback=false`, {
    headers: { 'user-agent': UA },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) return null;
  return { buf, type: r.headers.get('content-type') || 'image/jpeg' };
}

// IG's CDN only answers requests that look like they came from the site
async function fetchImage(url) {
  try {
    const r = await fetch(url.replace(/&amp;/g, '&'), {
      headers: { 'user-agent': UA, referer: 'https://www.instagram.com/' },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) return null;
    return { buf, type: r.headers.get('content-type') || 'image/jpeg' };
  } catch (e) {
    return null;
  }
}

// 2) the public web profile endpoint carries her real name, her avatar and the
// recent grid. Private accounts hide the grid — callers treat an empty result
// as "nothing to show", never as an error.
async function fetchProfile(handle, limit = 6) {
  const empty = { name: null, avatar: null, posts: [] };
  const r = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    {
      // this endpoint rejects anything that doesn't look like the site's own
      // XHR — without the sec-fetch trio it answers "SecFetch Policy violation"
      headers: igHeaders(handle, {
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
        accept: '*/*',
        origin: 'https://www.instagram.com',
        referer: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
      }),
      cache: 'no-store',
    }
  );

  if (r.status === 404) return { ...empty, status: 'not_found' };

  // 401/403 covers two different problems that need different words. Throttling
  // says "wait a few minutes" and clears on its own; everything else at those
  // codes is Instagram refusing to serve a logged-out server, which waiting
  // will never fix.
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    const body = await r.text().catch(() => '');
    const throttled = r.status === 429 || /wait a few minutes/i.test(body);
    return { ...empty, status: throttled ? 'rate_limited' : 'blocked' };
  }
  if (!r.ok) return { ...empty, status: 'error' };

  const json = await r.json().catch(() => null);
  const user = json?.data?.user;
  if (!user) return { ...empty, status: 'error' };

  // a private account still shows its name and avatar, just not the grid
  const name = (user.full_name || '').trim() || null;
  const avatar = user.profile_pic_url_hd || user.profile_pic_url || null;
  if (user.is_private) return { name, avatar, posts: [], status: 'private' };

  const edges = user.edge_owner_to_timeline_media?.edges || [];
  return {
    name,
    avatar,
    status: 'ok',
    posts: edges.slice(0, limit).map((e) => ({
      shortcode: e.node.shortcode,
      src: e.node.thumbnail_src || e.node.display_url,
      link: `https://www.instagram.com/p/${e.node.shortcode}/`,
    })),
  };
}

// A login wall is the app shell with nothing of hers in it: bare "Instagram"
// title, a link to the login form, no profile payload. It looks identical to a
// dead handle from the outside, so anything matching this has to answer
// "don't know" — calling it a bad handle is how a real account ends up
// reported as missing.
function isLoginWall(html) {
  if (/accounts\/login/i.test(html)) return true;
  if (/"require_login"|LoginAndSignupPage|loginForm/i.test(html)) return true;
  if (/<title>\s*Login\s*(&#0?8226;|•)/i.test(html)) return true;
  return false;
}

// The profile page is a separate endpoint from the profile API and often still
// answers when that one won't, so it's worth asking twice.
// Instagram soft-404s: a missing profile answers 200, so the status line tells
// us nothing. The <title> does — a real one reads
// "Jane Doe (@janedoe) • Instagram photos and videos", which carries her
// display name too, and a missing one is bare "Instagram". The @ arrives
// HTML-escaped, hence the alternation.
// Returns { exists, name, ogImage } where exists === null means the page
// couldn't tell us either way.
async function readProfilePage(handle) {
  const unknown = { exists: null, name: null, ogImage: null };
  try {
    const r = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: igHeaders(handle),
      cache: 'no-store',
    });
    if (!r.ok) return unknown;

    const html = await r.text();
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
    if (!title) return unknown;

    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = title.match(new RegExp(`^(.*?)\\s*\\((?:@|&#0?64;)${escaped}\\)`, 'i'));
    if (match) {
      const name = decodeEntities(match[1]).trim();
      return {
        exists: true,
        // some profiles title themselves "@handle (@handle)" — not a real name
        name: name && !name.startsWith('@') ? name : null,
        ogImage: html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] || null,
      };
    }
    // Bare "Instagram" and no og:image is what a dead handle looks like — and
    // also what a walled one looks like, so the wall check has to come first.
    if (isLoginWall(html)) return unknown;
    if (title.trim() === 'Instagram' && !/property="og:image"/.test(html)) {
      return { exists: false, name: null, ogImage: null };
    }
  } catch (e) {
    /* fall through */
  }
  return unknown;
}

function decodeEntities(s) {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?64;/g, '@')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Same reason the avatar gets copied: the signed CDN link expires in days, and
// it only answers the client it was minted for, so the browser can't load it
// directly either. Copy the bytes into our bucket and the grid is ours to keep.
async function cachePosts(handle, posts) {
  const saved = await Promise.all(
    posts.map(async (p) => {
      const img = await fetchImage(p.src);
      if (!img) return null;
      try {
        const path = `ig/${handle}/${p.shortcode}.jpg`;
        const { error } = await supabaseAdmin.storage
          .from('avatars')
          .upload(path, img.buf, { contentType: img.type, upsert: true });
        if (error) return null;
        const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);
        return { shortcode: p.shortcode, url: data.publicUrl, link: p.link };
      } catch (e) {
        return null;
      }
    })
  );
  return saved.filter(Boolean);
}

export async function POST(req) {
  const { input } = await req.json();
  const handle = parseHandle(input);
  if (!handle) {
    return NextResponse.json({ error: 'No handle in that.' }, { status: 400 });
  }

  // the page is asked for at most once per pull, by whoever needs it first
  let pending = null;
  const page = () => (pending ||= readProfilePage(handle));

  // the avatar and the profile are independent — one can fail without the other
  const [unavatar, profile] = await Promise.all([
    (async () => {
      try {
        return await fromUnavatar(handle);
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      try {
        const p = await fetchProfile(handle);
        return { ...p, posts: await cachePosts(handle, p.posts) };
      } catch (e) {
        return { name: null, avatar: null, posts: [], status: 'error' };
      }
    })(),
  ]);
  let { name, posts, status } = profile;
  let file = unavatar;

  // the profile JSON already carries her avatar — cheaper and more accurate
  // than going back out to a third party for it
  if (!file && profile.avatar) file = await fetchImage(profile.avatar);

  // The profile API is the flaky part. When it withholds her name — throttled,
  // walled, or a private account the JSON didn't cover — fall back to the
  // profile page, which also settles whether the handle exists at all.
  if (!name || status !== 'ok') {
    const p = await page();
    if (p.name && !name) name = p.name;

    // og:image on a real profile page is her avatar, the last place to get it
    if (!file && p.exists && p.ogImage) file = await fetchImage(p.ogImage);

    // Only the two sources that can actually see a profile get to call a handle
    // dead: a 404 from the API, or a page that rendered and didn't know her. A
    // blocked or throttled pull proves nothing about whether she exists, and
    // saying "no account" there sends you off to fix a handle that was fine.
    if (p.exists === false && status !== 'private' && status !== 'not_found') {
      status = file ? 'error' : 'not_found';
    } else if (p.exists === true && status === 'not_found') {
      status = 'blocked';
    }
  }

  // production has no other window into which half fell over
  if (!file || !posts.length) {
    console.warn(
      `[ig] ${handle}: status=${status} avatar=${file ? 'yes' : 'no'} posts=${posts.length} session=${SESSION ? 'yes' : 'no'}`
    );
  }

  if (!file) {
    // private, renamed, blocked, or rate-limited. caller falls back to manual.
    return NextResponse.json({
      handle,
      name,
      status,
      photo_url: null,
      posts,
      reason: 'no_public_photo',
    });
  }

  // IG's CDN links expire, so copy the bytes into our own bucket
  const path = `ig/${handle}-${Date.now()}.jpg`;
  const { error } = await supabaseAdmin.storage
    .from('avatars')
    .upload(path, file.buf, { contentType: file.type, upsert: true });

  if (error) {
    return NextResponse.json({ handle, name, status, photo_url: null, posts, reason: 'storage_failed' });
  }

  const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);
  return NextResponse.json({ handle, name, status, photo_url: data.publicUrl, posts });
}
