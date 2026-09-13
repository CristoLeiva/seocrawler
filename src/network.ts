import * as dns from 'node:dns';
import * as net from 'node:net';
import { Agent, fetch } from 'undici';
import { resolveHttpUrl } from './url-utils';

export interface SafeFetchPolicy {
  allowPrivateNetworks?: boolean;
  maxRedirects?: number;
}

const blockedAddresses = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.amazonaws.com',
]);

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) return !blockedAddresses.check(address, 'ipv6');
  return false;
}

export function assertSafeHttpUrl(input: string | URL, allowPrivateNetworks = false): URL {
  const parsed = resolveHttpUrl(input.toString());
  if (allowPrivateNetworks) return parsed;

  const hostname = stripIpv6Brackets(parsed.hostname).toLowerCase().replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.home.arpa')
  ) {
    throw new Error(`Private or local network destination is not allowed: ${hostname}`);
  }

  if (net.isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    throw new Error(`Private or non-public IP address is not allowed: ${hostname}`);
  }

  return parsed;
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, resolved) => {
    if (error) {
      callback(error, '');
      return;
    }

    const addresses = Array.isArray(resolved) ? resolved : [resolved];
    const unsafe = addresses.find((entry) => !isPublicIpAddress(entry.address));
    if (unsafe) {
      const lookupError = new Error(
        `DNS for ${hostname} resolved to a private or non-public address: ${unsafe.address}`,
      ) as NodeJS.ErrnoException;
      lookupError.code = 'EACCES';
      callback(lookupError, '');
      return;
    }

    if (addresses.length === 0) {
      const lookupError = new Error(`DNS for ${hostname} returned no addresses`) as NodeJS.ErrnoException;
      lookupError.code = 'ENOTFOUND';
      callback(lookupError, '');
      return;
    }

    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

const publicNetworkDispatcher = new Agent({
  connect: { lookup: safeLookup },
});

async function fetchOnce(
  url: URL,
  init: RequestInit,
  allowPrivateNetworks: boolean,
): Promise<Response> {
  assertSafeHttpUrl(url, allowPrivateNetworks);
  return fetch(url, {
    ...init,
    redirect: 'manual',
    dispatcher: allowPrivateNetworks ? undefined : publicNetworkDispatcher,
  }) as unknown as Promise<Response>;
}

export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  policy: SafeFetchPolicy = {},
): Promise<Response> {
  const allowPrivateNetworks = policy.allowPrivateNetworks === true;
  const maxRedirects = policy.maxRedirects ?? 10;
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 20) {
    throw new Error('maxRedirects must be an integer between 0 and 20');
  }

  let currentUrl = assertSafeHttpUrl(input, allowPrivateNetworks);
  const redirectMode = init.redirect ?? 'follow';
  if (redirectMode === 'error') {
    throw new Error('safeFetch does not support redirect mode "error"');
  }

  for (let hop = 0; ; hop++) {
    const response = await fetchOnce(currentUrl, init, allowPrivateNetworks);
    if (redirectMode === 'manual' || response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) return response;
    if (hop >= maxRedirects) {
      await response.body?.cancel();
      throw new Error(`Too many redirects (maximum ${maxRedirects})`);
    }

    const nextUrl = assertSafeHttpUrl(new URL(location, currentUrl), allowPrivateNetworks);
    await response.body?.cancel();
    currentUrl = nextUrl;
  }
}
