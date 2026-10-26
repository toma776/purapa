// Ruterul paginilor /manage. Fiecare pagină se randează la cerere, fără cache (§3.1).
import {can, HttpError} from '../core/store.mjs';
import {inferredCount} from '../core/inferred.mjs';
import {dashboard} from './views/dashboard.mjs';
import {entitiesIndex, entityList, entityNew, entityView} from './views/entities.mjs';
import {inferred, sources, map} from './views/review.mjs';
import {users} from './views/users.mjs';
import {byKey} from '../registry/entities.mjs';

export function renderManage(env, path, user) {
  const ctx = {...env, user, counts: {
    failed: env.db.prepare("SELECT COUNT(*) n FROM change_events WHERE status = 'failed'").get().n,
    inferred: inferredCount(env.db),
    syncConflict: env.syncStatus?.() ?? null
  }};
  if (!can(user, 'content.read')) throw new HttpError(403, 'Lipsește dreptul content.read');
  let m;
  if (path === '/manage/') return dashboard(ctx);
  if (path === '/manage/entitati/') return entitiesIndex(ctx);
  if ((m = /^\/manage\/entitati\/([a-z-]+)\/$/.exec(path)) && byKey[m[1]]) return entityList(ctx, m[1]);
  if ((m = /^\/manage\/entitati\/([a-z-]+)\/nou\/$/.exec(path)) && byKey[m[1]]) return entityNew(ctx, m[1]);
  if ((m = /^\/manage\/entitati\/([a-z-]+)\/(\d+)\/(?:([a-z-]+)\/)?$/.exec(path)) && byKey[m[1]]) {
    const html = entityView(ctx, m[1], Number(m[2]), m[3] ?? 'prezentare');
    if (html) return html;
  }
  if (path === '/manage/harta/') return map(ctx);
  if (path === '/manage/surse/') return sources(ctx);
  if (path === '/manage/surse/legaturi/') return inferred(ctx);
  if (path === '/manage/utilizatori/') {
    if (!can(user, 'users.write')) throw new HttpError(403, 'Lipsește dreptul users.write');
    return users(ctx);
  }
  throw new HttpError(404, 'Pagina nu există');
}
