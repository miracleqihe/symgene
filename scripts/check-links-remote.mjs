import { cloneSeed } from '../src/data.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 501]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;

async function request(url, method, {
  fetchImpl,
  maxRedirects,
  timeoutMs
}) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: method === 'GET'
          ? { Range: 'bytes=0-0', 'User-Agent': 'symgene-link-check/1.0' }
          : { 'User-Agent': 'symgene-link-check/1.0' }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      if (method === 'GET' && response.body) await response.body.cancel();
      return { status: response.status, finalUrl: currentUrl, redirects: redirectCount };
    }
    const location = response.headers.get('location');
    if (!location) {
      return { status: response.status, finalUrl: currentUrl, redirects: redirectCount };
    }
    if (response.body) await response.body.cancel();
    currentUrl = new URL(location, currentUrl).href;
  }
  throw new Error(`redirect limit exceeded (${maxRedirects})`);
}

export async function checkRemoteUrl(url, {
  fetchImpl = fetch,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const head = await request(url, 'HEAD', { fetchImpl, maxRedirects, timeoutMs });
  if (!HEAD_FALLBACK_STATUSES.has(head.status)) return head;
  return request(url, 'GET', { fetchImpl, maxRedirects, timeoutMs });
}

export async function reportRemoteLinks(data, output = console) {
  const urls = [...new Set(data.resources.map((resource) => resource.url))];
  let failed = 0;
  for (const url of urls) {
    try {
      const result = await checkRemoteUrl(url);
      const ok = result.status >= 200 && result.status < 400;
      output[ok ? 'log' : 'error'](
        `${ok ? 'OK' : 'FAIL'} ${result.status} ${url}`
        + (result.finalUrl !== url ? ` -> ${result.finalUrl}` : '')
      );
      if (!ok) failed += 1;
    } catch (error) {
      failed += 1;
      output.error(`FAIL network ${url}: ${error.name}`);
    }
  }
  if (failed) {
    output.error(`Remote link validation failed: ${failed}/${urls.length} unavailable.`);
    return 1;
  }
  output.log(`Remote link validation passed: ${urls.length}/${urls.length} reachable.`);
  return 0;
}

process.exitCode = await reportRemoteLinks(cloneSeed());
