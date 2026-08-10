import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { parseHandle } from '../../../lib/format';

export const runtime = 'nodejs';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

// 2) fallback: read the og:image tag off the public profile page
async function fromOgTag(handle) {
  const r = await fetch(`https://www.instagram.com/${handle}/`, {
    headers: { 'user-agent': UA },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  if (!m) return null;
  const img = await fetch(m[1].replace(/&amp;/g, '&'), { headers: { 'user-agent': UA } });
  if (!img.ok) return null;
  return {
    buf: Buffer.from(await img.arrayBuffer()),
    type: img.headers.get('content-type') || 'image/jpeg',
  };
}

// 3) the public web profile endpoint carries her real name and the recent grid.
// Anonymous requests work but are rate-limited, and private accounts hide the
// grid — callers treat an empty result as "nothing to show", never as an error.
async function fetchProfile(handle, limit = 6) {
  const r = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    {
      // this endpoint rejects anything that doesn't look like the site's own
      // XHR — without the sec-fetch trio it answers "SecFetch Policy violation"
      headers: {
        'user-agent': UA,
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
        accept: '*/*',
        origin: 'https://www.instagram.com',
        referer: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
      },
      cache: 'no-store',
    }
  );
  // throttling is the common failure by far, and it answers 401/429 with
  // require_login — worth telling apart from a genuinely private account
  if (r.status === 401 || r.status === 429) {
    return { name: null, posts: [], status: 'rate_limited' };
  }
  if (r.status === 404) return { name: null, posts: [], status: 'not_found' };
  if (!r.ok) return { name: null, posts: [], status: 'error' };

  const json = await r.json();
  const user = json?.data?.user;
  if (!user) return { name: null, posts: [], status: 'error' };

  // a private account still shows its display name, just not the grid
  const name = (user.full_name || '').trim() || null;
  if (user.is_private) return { name, posts: [], status: 'private' };

  const edges = user.edge_owner_to_timeline_media?.edges || [];
  return {
    name,
    status: 'ok',
    posts: edges.slice(0, limit).map((e) => ({
      shortcode: e.node.shortcode,
      src: e.node.thumbnail_src || e.node.display_url,
      link: `https://www.instagram.com/p/${e.node.shortcode}/`,
    })),
  };
}

// When the profile API throttles us it can't tell us whether she exists. The
// plain profile page is a separate endpoint and usually still answers, and a
// 404 there is a real answer — so a bad handle stops reading as "try later".
// Instagram soft-404s: a missing profile answers 200, so the status line tells
// us nothing. The <title> does — a real one reads
// "Instagram (@handle) • Instagram photos and videos", a missing one is bare
// "Instagram". The @ arrives HTML-escaped, hence the alternation.
// Returns { exists, name }. The title reads
// "Jane Doe (@janedoe) • Instagram photos and videos" — which carries her
// display name too, and this page keeps answering when the profile API is
// throttled. That's the difference between a filled-in name and a blank one.
async function readProfilePage(handle) {
  try {
    const r = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: { 'user-agent': UA },
      cache: 'no-store',
    });
    if (!r.ok) return { exists: null, name: null };

    const html = await r.text();
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
    if (!title) return { exists: null, name: null };

    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = title.match(new RegExp(`^(.*?)\\s*\\((?:@|&#0?64;)${escaped}\\)`, 'i'));
    if (match) {
      const name = decodeEntities(match[1]).trim();
      // some profiles title themselves "@handle (@handle)" — not a real name
      return { exists: true, name: name && !name.startsWith('@') ? name : null };
    }
    // bare "Instagram" and no og:image is what a dead handle looks like
    if (title.trim() === 'Instagram' && !/property="og:image"/.test(html)) {
      return { exists: false, name: null };
    }
  } catch (e) {
    /* fall through */
  }
  return { exists: null, name: null };
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
      try {
        const img = await fetch(p.src, {
          headers: { 'user-agent': UA, referer: 'https://www.instagram.com/' },
          cache: 'no-store',
        });
        if (!img.ok) return null;
        const buf = Buffer.from(await img.arrayBuffer());
        const path = `ig/${handle}/${p.shortcode}.jpg`;
        const { error } = await supabaseAdmin.storage
          .from('avatars')
          .upload(path, buf, {
            contentType: img.headers.get('content-type') || 'image/jpeg',
            upsert: true,
          });
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

  // the avatar and the profile are independent — one can fail without the other
  const [file, profile] = await Promise.all([
    (async () => {
      try {
        return (await fromUnavatar(handle)) || (await fromOgTag(handle));
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      try {
        const p = await fetchProfile(handle);
        return { name: p.name, status: p.status, posts: await cachePosts(handle, p.posts) };
      } catch (e) {
        return { name: null, posts: [], status: 'error' };
      }
    })(),
  ]);
  let { name, posts, status } = profile;

  // The profile API is the flaky part. When it withholds her name — throttled,
  // or a private account the JSON didn't cover — fall back to the profile page,
  // which also settles whether the handle exists at all.
  if (!name || (status === 'rate_limited' && !file)) {
    const page = await readProfilePage(handle);
    if (page.name) name = page.name;
    if (page.exists === false && !file) status = 'not_found';
  }

  if (!file) {
    // private, renamed, or rate-limited. caller falls back to manual photo.
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
