import { createPreviewServer } from './preview-server.mjs';

const server = createPreviewServer();
server.listen(Number(process.env.PORT ?? 4388), '127.0.0.1', () =>
  console.log('MangaName : http://localhost:' + server.address().port));
