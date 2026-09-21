#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isDirectCli } from './is-direct-cli.mjs';
export function readEnvFile(contents) {
  const values = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function resolveAnalyticsSettings(env) {
 const host = env.EXPO_PUBLIC_ANALYTICS_HOST?.trim();
 const apiKey = env.EXPO_PUBLIC_UMAMI_WEBSITE_ID?.trim();
 if (host !== 'https://stats.phosphene.cc' || apiKey !== 'b7375888-6948-4e98-9805-8d4a9a1399db') throw new Error('Use the reviewed Frume Umami origin and website ID.');
 return { host, apiKey, captureUrl: `${host}/native/batch` };
}
export async function verifyAnalyticsTransport(env = process.env, send = fetch) {
 if (env.FRUME_VERIFY_ANALYTICS !== '1') return;
 const config = resolveAnalyticsSettings(env);
 const response = await send(config.captureUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify([{ type: 'event', payload: { website: config.apiKey, hostname: 'frume.ios', url: '/', name: 'frume_transport_check', tag: 'analytics-smoke:native-migration', id: 'frume:00000000000000000000000000000000', ip: '127.0.0.1', browser: '', os: 'iOS', device: 'mobile', data: {} } }]) });
 const receipt = await response.json();
 if (!response.ok || receipt.errors !== 0 || receipt.processed !== 1) throw new Error('Umami did not accept the transport check');
 console.log('Umami accepted one synthetic event. Verify its stored row; this is not device/release proof.');
}
if (isDirectCli(import.meta.url)) {
 let local = {}; try { local = readEnvFile(readFileSync('.env.local', 'utf8')); } catch {}
 await verifyAnalyticsTransport({ ...local, ...process.env });
}
