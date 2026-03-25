import { CrawlOptions, PageResult, RobotsTxt, SitemapEntry } from './types';
import { analyzePage } from './analyzers';
import chalk from 'chalk';

export async function fetchRobotsTxt(sitemapUrl: string, userAgent: string): Promise<RobotsTxt | undefined> {
  try {
    const origin = new URL(sitemapUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
    });
    if (!response.ok) return undefined;

    const raw = await response.text();
    const disallowedPaths: string[] = [];

    // Parse robots.txt — simplified: looks at User-agent: * block
    let inWildcardBlock = false;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.replace('user-agent:', '').trim();
        inWildcardBlock = agent === '*';
      } else if (inWildcardBlock && trimmed.startsWith('disallow:')) {
        const path = line.trim().replace(/^disallow:\s*/i, '').trim();
        if (path) {
          disallowedPaths.push(path);
        }
      }
    }

    return { disallowedPaths, raw };
  } catch {
    return undefined;
  }
}

export async function crawlPages(
  entries: SitemapEntry[],
  options: CrawlOptions,
  robotsTxt?: RobotsTxt,
): Promise<PageResult[]> {
  const results: PageResult[] = [];
  let completed = 0;
  const total = entries.length;

  for (let i = 0; i < entries.length; i += options.concurrency) {
    const batch = entries.slice(i, i + options.concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((entry) => crawlSinglePage(entry.loc, options, robotsTxt)),
    );

    for (const result of batchResults) {
      completed++;
      if (result.status === 'fulfilled') {
        const page = result.value;
        const issueCount = page.issues.length;
        const errorCount = page.issues.filter((i) => i.severity === 'error').length;

        let statusIcon: string;
        if (page.statusCode >= 400) {
          statusIcon = chalk.red(`[${page.statusCode}]`);
        } else if (page.statusCode >= 300) {
          statusIcon = chalk.yellow(`[${page.statusCode}]`);
        } else {
          statusIcon = chalk.green(`[${page.statusCode}]`);
        }

        const issueText =
          errorCount > 0
            ? chalk.red(`${errorCount} errors, ${issueCount - errorCount} other`)
            : issueCount > 0
              ? chalk.yellow(`${issueCount} issues`)
              : chalk.green('OK');

        console.log(
          `  ${chalk.gray(`[${completed}/${total}]`)} ${statusIcon} ${truncate(page.url, 70)} - ${issueText} ${chalk.gray(`(${page.responseTime}ms`)})`
        );
        results.push(page);
      } else {
        console.log(
          `  ${chalk.gray(`[${completed}/${total}]`)} ${chalk.red('[ERR]')} ${truncate(batch[batchResults.indexOf(result)]?.loc || 'unknown', 70)} - ${result.reason}`,
        );
      }
    }
  }

  return results;
}

async function crawlSinglePage(url: string, options: CrawlOptions, robotsTxt?: RobotsTxt): Promise<PageResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  const start = Date.now();
  const redirectChain: string[] = [];

  try {
    // Use manual redirect following to track the chain
    let currentUrl = url;
    let response: Response | null = null;
    let hops = 0;
    const maxHops = 10;

    while (hops < maxHops) {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': options.userAgent },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          redirectChain.push(currentUrl);
          currentUrl = new URL(location, currentUrl).href;
          hops++;
          continue;
        }
      }
      break;
    }

    if (!response) {
      throw new Error('No response received');
    }

    const html = await response.text();
    const responseTime = Date.now() - start;
    const finalUrl = currentUrl;
    const xRobotsTag = response.headers.get('x-robots-tag');

    if (response.status >= 400) {
      return {
        url,
        finalUrl,
        statusCode: response.status,
        redirectChain,
        responseTime,
        contentLength: html.length,
        wordCount: 0,
        contentToHtmlRatio: 0,
        title: null,
        metaDescription: null,
        canonical: null,
        h1s: [],
        xRobotsTag,
        issues: [
          {
            type: 'http-error',
            severity: 'error',
            message: `HTTP ${response.status} ${response.statusText}`,
          },
        ],
      };
    }

    return analyzePage(url, finalUrl, html, response.status, responseTime, redirectChain, xRobotsTag, { robotsTxt });
  } catch (err) {
    const responseTime = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      url,
      finalUrl: url,
      statusCode: 0,
      redirectChain,
      responseTime,
      contentLength: 0,
      wordCount: 0,
      contentToHtmlRatio: 0,
      title: null,
      metaDescription: null,
      canonical: null,
      h1s: [],
      xRobotsTag: null,
      issues: [
        {
          type: 'fetch-error',
          severity: 'error',
          message: `Failed to fetch: ${message}`,
        },
      ],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
