import { CrawlOptions } from './types';

export const CRAWL_LIMITS = {
  concurrency: { min: 1, max: 20 },
  timeout: { min: 100, max: 120_000 },
  pageLimit: { min: 1, max: 100_000 },
} as const;

export function parseBoundedInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

export function validateCrawlOptions(options: CrawlOptions): CrawlOptions {
  const concurrency = parseBoundedInteger(
    options.concurrency,
    'concurrency',
    CRAWL_LIMITS.concurrency.min,
    CRAWL_LIMITS.concurrency.max,
  );
  const timeout = parseBoundedInteger(
    options.timeout,
    'timeout',
    CRAWL_LIMITS.timeout.min,
    CRAWL_LIMITS.timeout.max,
  );

  if (typeof options.userAgent !== 'string' || options.userAgent.trim().length === 0) {
    throw new Error('user-agent must be a non-empty string');
  }
  if (options.userAgent.length > 256 || /[\r\n]/.test(options.userAgent)) {
    throw new Error('user-agent must be at most 256 characters and contain no line breaks');
  }

  return {
    ...options,
    concurrency,
    timeout,
    userAgent: options.userAgent.trim(),
    allowPrivateNetworks: options.allowPrivateNetworks === true,
  };
}

export function parsePageLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parseBoundedInteger(
    value,
    'limit',
    CRAWL_LIMITS.pageLimit.min,
    CRAWL_LIMITS.pageLimit.max,
  );
}
