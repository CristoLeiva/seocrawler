export function resolveHttpUrl(input: string, base?: string): URL {
  let parsed: URL;
  try {
    parsed = base ? new URL(input, base) : new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not allowed');
  }

  return parsed;
}

export function normalizeUrl(input: string, base?: string): string {
  const parsed = resolveHttpUrl(input, base);
  parsed.hash = '';
  return parsed.href;
}

export function urlComparisonKey(input: string, base?: string): string {
  const parsed = resolveHttpUrl(input, base);
  parsed.hash = '';

  let pathname = parsed.pathname;
  if (pathname !== '/') pathname = pathname.replace(/\/+$/, '');

  return `${parsed.origin}${pathname === '/' ? '' : pathname}${parsed.search}`;
}

export function isSameOrigin(left: string, right: string): boolean {
  return resolveHttpUrl(left).origin === resolveHttpUrl(right).origin;
}
