import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { logActivity } from '../../../lib/audit';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

// The browser holds the anon key, and storage.objects always has RLS on, so a
// direct client upload needs a policy that lets anon write. Going through the
// server with the service role instead keeps the bucket's policies untouched
// and still works once real auth is added.
export async function POST(req) {
  const form = await req.formData();
  const file = form.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file.' }, { status: 400 });
  }
  if (!file.type?.startsWith('image/')) {
    return NextResponse.json({ error: 'That file is not an image.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is over 8MB.' }, { status: 400 });
  }

  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `upload/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'jpg'}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from('avatars')
    .upload(path, buf, { contentType: file.type, upsert: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);

  // Photos are logged here rather than in /api/people. The sheet uploads first
  // and saves the row after, and the weekly Instagram re-pull writes the same
  // columns with nobody behind it — so the upload itself is the only moment
  // that a person actually chose to add a picture.
  const personId = form.get('person_id') || null;
  const avatar = form.get('kind') === 'avatar';
  // her name off the row when there is one; a person being added doesn't have
  // an id yet, so the sheet sends what's typed in the name field instead
  let name = String(form.get('name') || '').trim();
  if (personId) {
    const { data: person } = await supabaseAdmin
      .from('people')
      .select('name')
      .eq('id', personId)
      .maybeSingle();
    if (person?.name) name = person.name;
  }

  await logActivity(req, {
    action: avatar ? 'photo.avatar' : 'photo.add',
    subject: name || null,
    person_id: personId,
    detail: name
      ? `${avatar ? 'Changed' : 'Added'} a photo for ${name}`
      : `${avatar ? 'Changed' : 'Added'} a photo`,
  });

  return NextResponse.json({ photo_url: data.publicUrl });
}
