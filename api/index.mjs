// Intrarea pe Vercel: toate adresele trec prin aceeași aplicație ca serverul local (vezi vercel.json).
// Baza: DATABASE_URL (Supabase, prin pooler). După o propagare, CDN-ul se golește exact pentru paginile refăcute.
import {dangerouslyDeleteByTag} from '@vercel/functions';
import {createApp, cacheTag} from '../src/app.mjs';

let app;

export default async function handler(req, res) {
  app ??= createApp({
    migrateOnStart: false, // schema se aplică la deploy: npm run migrate
    onInvalidate: paths => dangerouslyDeleteByTag(paths.map(cacheTag))
  }).catch(e => { app = null; throw e; });
  return (await app).handle(req, res);
}
