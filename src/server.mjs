import http from 'node:http';
import {createApp} from './app.mjs';

const port = Number(process.env.PORT ?? 3000);
const app = await createApp();
await app.sync.start();
http.createServer(app.handle).listen(port, () => console.log(`purapa: http://localhost:${port}/`));
