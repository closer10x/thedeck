import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// Only these ever reach the database. Whatever else the client sends is
// dropped, so a stray field can't become a column write.
function sanitize(body) {
  return {
    name: String(body.name || '').trim(),
    ig_handle: body.ig_handle || null,
    phone: body.phone || null,
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 6) : [],
    photos_synced_at: body.photos_synced_at || null,
    photo_url: body.photo_url || null,
    note: body.note || null,
    rat_chat: !!body.rat_chat,
    archived: !!body.archived,
  };
}

// insert when there's no id, update when there is. Returns the id either way so
// autosave can switch from creating to updating after the first write.
export async function POST(req) {
  const body = await req.json();
  const row = sanitize(body);

  if (!row.name) {
    return NextResponse.json({ error: 'She needs a name.' }, { status: 400, headers: NO_STORE });
  }

  const res = body.id
    ? await supabaseAdmin.from('people').update(row).eq('id', body.id).select('id').single()
    : await supabaseAdmin.from('people').insert(row).select('id').single();

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ id: res.data.id }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  const { error } = await supabaseAdmin.from('people').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
