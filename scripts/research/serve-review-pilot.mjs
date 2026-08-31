import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const UI_PATH = resolve(SCRIPT_DIR, 'social-review-ui.html');

function parseCli(args) {
  const options = { port: 43219 };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--queue') options.queuePath = resolve(value);
    else if (flag === '--port') options.port = Number(value);
    else throw new Error(`unknown argument: ${flag}`);
    index += 1;
  }
  if (!options.queuePath) throw new Error('provide --queue');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error('port must be an integer between 1024 and 65535');
  }
  return options;
}

export function createReviewServer({ queuePath }) {
  const ui = readFileSync(UI_PATH);
  const queue = readFileSync(queuePath);
  const parsed = JSON.parse(queue);
  if (parsed?.publicationStatus !== 'LOCAL_REVIEW_ONLY' || !Array.isArray(parsed.records)) {
    throw new Error('queue must be a LOCAL_REVIEW_ONLY review packet');
  }
  const securityHeaders = {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
  return createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { ...securityHeaders, Allow: 'GET' });
      response.end('Method not allowed');
      return;
    }
    if (request.url === '/' || request.url === '/index.html') {
      response.writeHead(200, { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      response.end(ui);
      return;
    }
    if (request.url === '/queue.json') {
      response.writeHead(200, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(queue);
      return;
    }
    response.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseCli(process.argv.slice(2));
    const server = createReviewServer(options);
    server.listen(options.port, '127.0.0.1', () => {
      console.log(`Local review UI: http://127.0.0.1:${options.port}/`);
      console.log('Labels remain in browser memory until you export them. No network upload is implemented.');
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
