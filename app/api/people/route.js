import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { actorName } from '../../../lib/lock';
import { logActivity, changedFields, andList, FIELD_LABELS } from '../../../lib/audit';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

// What the feed has a sentence for. Photos are deliberately absent: an upload
// is logged by /api/upload where it happens, and the weekly Instagram re-pull
// writes photos on its own, so diffing them here would fill the log with
// "updated photos" nobody did.
const LOGGED = ['name', 'ig_handle', 'phone', 'note', 'rat_chat'];

// Only these ever reach the database. Whatever else the client sends is
// dropped, so a stray field can't become a column write — created_by included,
// which is set from the session cookie and never from the request body.
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

  if (!body.id) {
    const res = await supabaseAdmin
      .from('people')
      .insert({ ...row, created_by: await actorName(req) })
      .select('id')
      .single();

    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
    }
    await logActivity(req, {
      action: 'person.add',
      subject: row.name,
      person_id: res.data.id,
      detail: `Added ${row.name}`,
    });
    return NextResponse.json({ id: res.data.id }, { headers: NO_STORE });
  }

  // Read first, so the log can say what changed rather than that something did.
  // Autosave posts the whole row on a debounce, and most of those posts differ
  // from the stored row in nothing at all.
  const { data: before } = await supabaseAdmin
    .from('people')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();

  const res = await supabaseAdmin.from('people').update(row).eq('id', body.id).select('id').single();
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE });
  }

  if (before) {
    // archiving is its own thing, not one field among several
    if (!before.archived !== !row.archived) {
      await logActivity(req, {
        action: row.archived ? 'person.archive' : 'person.unarchive',
        subject: row.name,
        person_id: body.id,
        detail: row.archived ? `Archived ${row.name}` : `Brought ${row.name} back`,
      });
    }

    const changed = changedFields(before, row, LOGGED);
    if (changed.length) {
      // a rename should read as one, and say what it was
      const renamed = changed.includes('name');
      const labels = changed.map((f) => FIELD_LABELS[f] || f);
      await logActivity(req, {
        action: 'person.update',
        subject: row.name,
        person_id: body.id,
        detail: renamed
          ? `Renamed ${before.name} to ${row.name}${
              changed.length > 1 ? `, and changed her ${andList(labels.filter((l) => l !== 'name'))}` : ''
            }`
          : `Updated ${row.name}'s ${andList(labels)}`,
        meta: { fields: changed },
      });
    }
  }

  return NextResponse.json({ id: res.data.id }, { headers: NO_STORE });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No id.' }, { status: 400, headers: NO_STORE });

  // Her name and her tally have to be read before the row goes, or the entry
  // recording the deletion has nothing to name.
  const [{ data: person }, { count }] = await Promise.all([
    supabaseAdmin.from('people').select('name').eq('id', id).maybeSingle(),
    supabaseAdmin.from('invites').select('id', { count: 'exact', head: true }).eq('person_id', id),
  ]);

  const { error } = await supabaseAdmin.from('people').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const name = person?.name || 'someone';
  const asks = count || 0;
  await logActivity(req, {
    action: 'person.remove',
    subject: name,
    // no person_id: the row is gone, and the reference would be nulled anyway
    detail: asks ? `Deleted ${name} and her ${asks} ${asks === 1 ? 'ask' : 'asks'}` : `Deleted ${name}`,
    meta: { asks },
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
