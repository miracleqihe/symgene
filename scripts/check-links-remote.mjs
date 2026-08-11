import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneSeed } from '../src/data.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 501]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const NHC_HOME_URL = 'https://www.nhc.gov.cn/';

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
      return {
        status: response.status,
        finalUrl: currentUrl,
        redirects: redirectCount,
        wafRay: response.headers.get('wzws-ray') || ''
      };
    }
    const location = response.headers.get('location');
    if (!location) {
      return {
        status: response.status,
        finalUrl: currentUrl,
        redirects: redirectCount,
        wafRay: response.headers.get('wzws-ray') || ''
      };
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

export function classifyRemoteResult(url, result) {
  if (result.status >= 200 && result.status < 400) return 'ok';
  const normalizedUrl = new URL(url).href;
  // NHC's WZWS WAF returns a stable 412 challenge to CI clients. Keep this
  // exception exact so unrelated 412 responses and genuinely broken links fail.
  if (normalizedUrl === NHC_HOME_URL
    && result.finalUrl === NHC_HOME_URL
    && result.status === 412
    && /-w-waf/i.test(result.wafRay)) {
    return 'access-blocked';
  }
  return 'failed';
}

export async function reportRemoteLinks(data, output = console, checkOptions = {}) {
  const urls = [...new Set(data.resources.map((resource) => resource.url))];
  let failed = 0;
  let accessBlocked = 0;
  for (const url of urls) {
    try {
      const result = await checkRemoteUrl(url, checkOptions);
      const classification = classifyRemoteResult(url, result);
      const redirect = result.finalUrl !== url ? ` -> ${result.finalUrl}` : '';
      if (classification === 'ok') {
        output.log(`OK ${result.status} ${url}${redirect}`);
      } else if (classification === 'access-blocked') {
        accessBlocked += 1;
        const warn = typeof output.warn === 'function' ? output.warn.bind(output) : output.log.bind(output);
        warn(`ACCESS-BLOCKED ${result.status} ${url} (confirmed WAF challenge)`);
      } else {
        failed += 1;
        output.error(`FAIL ${result.status} ${url}${redirect}`);
      }
    } catch (error) {
      failed += 1;
      output.error(`FAIL network ${url}: ${error.name}`);
    }
  }
  if (failed) {
    output.error(`Remote link validation failed: ${failed}/${urls.length} unavailable.`);
    return 1;
  }
  if (accessBlocked) {
    output.log(
      `Remote link validation passed: ${urls.length - accessBlocked}/${urls.length} reachable; `
      + `${accessBlocked} access-blocked by a confirmed WAF challenge.`
    );
  } else {
    output.log(`Remote link validation passed: ${urls.length}/${urls.length} reachable.`);
  }
  return 0;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  process.exitCode = await reportRemoteLinks(cloneSeed());
}
