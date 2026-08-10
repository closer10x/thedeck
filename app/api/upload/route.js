import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

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
  return NextResponse.json({ photo_url: data.publicUrl });
}
