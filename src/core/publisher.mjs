// Publicarea automată a site-ului din serverul local: când conținutul se schimbă, paginile statice din public/
// se regenerează, iar după `quiet` secunde fără alte schimbări se comit și se urcă pe GitHub. Vercel publică singur
// fiecare push pe main. Se comite doar public/ (codul are commiturile lui, cu mesaj).
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildStatic} from '../site/static.mjs';

const run = promisify(execFile);
const git = (...args) => run('git', args, {windowsHide: true});

export function createPublisher({getStore, quiet = 15, log = console.log}) {
  let dirtySince = null, unpushed = false, busy = false;

  async function commit() {
    await git('add', '-A', '--', 'public');
    const {stdout} = await git('diff', '--cached', '--name-only', '--', 'public');
    if (!stdout.trim()) return false;
    await git('commit', '-q', '-m', 'Conținut publicat din panou', '--', 'public');
    return true;
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const {changed} = await buildStatic(getStore());
      if (changed.length) dirtySince = Date.now();
      if (dirtySince && Date.now() - dirtySince >= quiet * 1000) {
        dirtySince = null;
        if (await commit()) unpushed = true;
      }
      // Un push eșuat (fără internet, de exemplu) se reîncearcă la următoarele treceri.
      if (unpushed) {
        await git('push', '-q');
        unpushed = false;
        log('[publicare] conținutul nou a plecat pe GitHub; Vercel îl publică în câteva zeci de secunde');
      }
    } catch (e) {
      log(`[publicare] eroare: ${e.stderr?.trim() || e.message}`);
    } finally {
      busy = false;
    }
  }

  return {tick};
}
