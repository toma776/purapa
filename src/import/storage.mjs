// Supabase Storage pentru fișierele media (pe Vercel nu există disc permanent).
// Se folosește doar la import, local, cu cheia de serviciu din mediu (nu intră în git și nu ajunge pe Vercel).
// Bucket public: site-ul servește imaginile direct de la Supabase; numele e amprenta, deci un conținut nou are adresă nouă.
const MIME = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif'};

export function supabaseStorage({url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, bucket = 'media'} = {}) {
  if (!url || !key) return null;
  const base = url.replace(/\/$/, '');
  const headers = {authorization: `Bearer ${key}`, apikey: key};
  let ready = null;

  const ensureBucket = () => ready ??= (async () => {
    const r = await fetch(`${base}/storage/v1/bucket`, {method: 'POST', headers: {...headers, 'content-type': 'application/json'},
      body: JSON.stringify({id: bucket, name: bucket, public: true})});
    if (!r.ok && r.status !== 409 && !/already exists/i.test(await r.text())) throw new Error(`Supabase Storage: bucket-ul ${bucket} nu s-a putut crea (${r.status})`);
  })();

  async function upload(name, buf) {
    await ensureBucket();
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const r = await fetch(`${base}/storage/v1/object/${bucket}/${encodeURIComponent(name)}`, {method: 'POST',
      headers: {...headers, 'content-type': MIME[ext] ?? 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=31536000'}, body: buf});
    if (!r.ok) throw new Error(`Supabase Storage: ${name} nu s-a putut urca (${r.status} ${await r.text()})`);
    return publicUrl(name);
  }

  const publicUrl = name => `${base}/storage/v1/object/public/${bucket}/${encodeURIComponent(name)}`;
  return {upload, publicUrl};
}
