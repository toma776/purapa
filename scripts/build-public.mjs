// Site-ul public ca fișiere statice în public/ (pagini, resurse, imaginile folosite, robots.txt).
// De obicei nu e nevoie de el: serverul local (npm start) le regenerează și le publică singur.
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {buildStatic} from '../src/site/static.mjs';

const db = openDb(process.env.DB ?? 'data/purapa.db');
migrate(db);
const {pages, changed} = await buildStatic(createStore(db));
db.close();
console.log(`public/: ${pages} pagini, ${changed.length} fișiere schimbate.`);
