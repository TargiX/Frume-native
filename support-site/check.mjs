#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_PAGE_CONTENT_CONTRACTS,
  releasePageContentFailures,
} from './release-content-contract.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, 'public');
const pageContracts = Object.values(RELEASE_PAGE_CONTENT_CONTRACTS);
const pages = pageContracts.map(({ file }) => file);
const failures = [];

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

function internalTarget(href, file) {
  const path = href.split('#', 1)[0].split('?', 1)[0];
  if (!path) return null;
  if (path === '/') return 'index.html';
  if (path === '/privacy' || path === '/privacy/') return 'privacy/index.html';
  if (path === '/styles.css') return 'styles.css';
  if (/^(?:https?:|mailto:)/.test(path)) return null;
  return join(dirname(file), path.replace(/^\//, ''));
}

for (const contract of pageContracts) {
  const { file } = contract;
  const html = await readFile(join(publicRoot, file), 'utf8');

  if (!/^<!doctype html>/i.test(html)) fail(file, 'missing HTML doctype');
  if (!/<html\s+lang="en">/i.test(html)) fail(file, 'missing English page language');
  if (!/<meta\s+name="viewport"/i.test(html)) fail(file, 'missing viewport metadata');
  if (!/<meta[\s\S]*?name="description"/i.test(html)) fail(file, 'missing description metadata');
  if (!/<main\s+id="main-content"/i.test(html)) fail(file, 'missing main landmark');
  if (!/class="skip-link"\s+href="#main-content"/i.test(html)) fail(file, 'missing skip link');
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) fail(file, 'must contain exactly one h1');
  if (/<script\b/i.test(html)) fail(file, 'page must not load or run scripts');
  if (/\b(?:src|href)="http:\/\//i.test(html)) fail(file, 'contains insecure HTTP resource');
  for (const contentFailure of releasePageContentFailures(html, contract)) {
    fail(file, contentFailure);
  }

  for (const match of html.matchAll(/\bhref="([^"]+)"/gi)) {
    const href = match[1];
    const target = internalTarget(href, file);
    if (target) {
      try {
        await access(join(publicRoot, target));
      } catch {
        fail(file, `broken internal link ${href}`);
      }
    }

    if (href.startsWith('#')) {
      const id = href.slice(1);
      if (!new RegExp(`\\bid="${id}"`).test(html)) {
        fail(file, `missing fragment target ${href}`);
      }
    }
  }
}

try {
  const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  if (vercel.trailingSlash !== true) fail('vercel.json', 'trailingSlash must be true');
  if (vercel.cleanUrls !== true) fail('vercel.json', 'cleanUrls must be true');
  if (vercel.outputDirectory !== 'public') {
    fail('vercel.json', 'outputDirectory must isolate public files');
  }
  const headers = JSON.stringify(vercel.headers ?? []);
  if (!headers.includes("script-src 'none'")) {
    fail('vercel.json', 'CSP must prohibit scripts');
  }
} catch (error) {
  fail('vercel.json', `invalid configuration: ${error.message}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Support site checks passed (${pages.length} pages, no client scripts).`);
}
