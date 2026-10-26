import http from 'node:http';
import {createApp} from './app.mjs';

const port = Number(process.env.PORT ?? 3000);
const app = createApp({file: process.env.DB ?? 'data/purapa.db'});
app.sync.start();
http.createServer(app.handle).listen(port, () => console.log(`purapa: http://localhost:${port}/`));
