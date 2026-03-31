import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { CrawlSummary, PageResult, SeoIssue } from './types';

export function buildSummary(pages: PageResult[], duration: number): CrawlSummary {
  const allIssues = pages.flatMap((p) => p.issues);
  const issuesByType: Record<string, number> = {};

  for (const issue of allIssues) {
    issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
  }

  return {
    totalUrls: pages.length,
    crawledUrls: pages.filter((p) => p.statusCode > 0).length,
    totalIssues: allIssues.length,
    errors: allIssues.filter((i) => i.severity === 'error').length,
    warnings: allIssues.filter((i) => i.severity === 'warning').length,
    infos: allIssues.filter((i) => i.severity === 'info').length,
    issuesByType,
    crossPageIssues: [],
    pages,
    duration,
  };
}

export function printReport(summary: CrawlSummary): void {
  console.log('\n' + chalk.bold('═══════════════════════════════════════════════'));
  console.log(chalk.bold('  SEO CRAWL REPORT'));
  console.log(chalk.bold('═══════════════════════════════════════════════') + '\n');

  // Overview
  console.log(chalk.bold('Overview'));
  console.log(`  Pages crawled:  ${summary.crawledUrls}/${summary.totalUrls}`);
  console.log(`  Duration:       ${(summary.duration / 1000).toFixed(1)}s`);
  console.log(`  Total issues:   ${summary.totalIssues}`);
  console.log(`    ${chalk.red('Errors:')}      ${summary.errors}`);
  console.log(`    ${chalk.yellow('Warnings:')}    ${summary.warnings}`);
  console.log(`    ${chalk.blue('Info:')}         ${summary.infos}`);

  // Indexability
  const indexable = summary.pages.filter((p) => p.indexability === 'indexable').length;
  const nonIndexable = summary.pages.filter((p) => p.indexability === 'non-indexable');
  console.log(`  Indexable:      ${chalk.green(String(indexable))} | Non-indexable: ${nonIndexable.length > 0 ? chalk.red(String(nonIndexable.length)) : '0'}`);
  if (nonIndexable.length > 0) {
    for (const page of nonIndexable.slice(0, 5)) {
      console.log(`    ${chalk.red('✗')} ${page.url} — ${page.indexabilityReason}`);
    }
    if (nonIndexable.length > 5) {
      console.log(`    ${chalk.gray(`... and ${nonIndexable.length - 5} more`)}`);
    }
  }
  console.log();

  // Top issues by frequency
  const sortedIssues = Object.entries(summary.issuesByType).sort((a, b) => b[1] - a[1]);
  if (sortedIssues.length > 0) {
    console.log(chalk.bold('Top Issues by Frequency'));
    for (const [type, count] of sortedIssues.slice(0, 15)) {
      const severity = getSeverityForType(type, summary.pages);
      const icon =
        severity === 'error' ? chalk.red('●') : severity === 'warning' ? chalk.yellow('●') : chalk.blue('●');
      console.log(`  ${icon} ${type}: ${count} page(s)`);
    }
    console.log();
  }

  // Pages with most issues
  const pagesWithIssues = summary.pages
    .filter((p) => p.issues.length > 0)
    .sort((a, b) => {
      const aErrors = a.issues.filter((i) => i.severity === 'error').length;
      const bErrors = b.issues.filter((i) => i.severity === 'error').length;
      if (aErrors !== bErrors) return bErrors - aErrors;
      return b.issues.length - a.issues.length;
    });

  if (pagesWithIssues.length > 0) {
    console.log(chalk.bold('Pages with Most Issues (top 10)'));
    for (const page of pagesWithIssues.slice(0, 10)) {
      const errors = page.issues.filter((i) => i.severity === 'error').length;
      const warnings = page.issues.filter((i) => i.severity === 'warning').length;
      console.log(`  ${chalk.underline(page.url)}`);
      console.log(
        `    ${chalk.red(`${errors} errors`)}, ${chalk.yellow(`${warnings} warnings`)} | ${page.responseTime}ms | ${(page.contentLength / 1024).toFixed(0)}KB`,
      );
      for (const issue of page.issues.filter((i) => i.severity === 'error')) {
        console.log(`      ${chalk.red('✗')} ${issue.message}`);
      }
      for (const issue of page.issues.filter((i) => i.severity === 'warning').slice(0, 3)) {
        console.log(`      ${chalk.yellow('!')} ${issue.message}`);
      }
      console.log();
    }
  }

  // HTTP Status summary
  const statusCodes = new Map<number, number>();
  for (const page of summary.pages) {
    statusCodes.set(page.statusCode, (statusCodes.get(page.statusCode) || 0) + 1);
  }
  console.log(chalk.bold('HTTP Status Codes'));
  for (const [code, count] of [...statusCodes.entries()].sort((a, b) => a[0] - b[0])) {
    const color = code >= 400 ? chalk.red : code >= 300 ? chalk.yellow : chalk.green;
    console.log(`  ${color(`${code}`)}: ${count} page(s)`);
  }
  console.log();

  // Performance
  const responseTimes = summary.pages.filter((p) => p.statusCode > 0).map((p) => p.responseTime);
  if (responseTimes.length > 0) {
    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const max = Math.max(...responseTimes);
    const min = Math.min(...responseTimes);
    console.log(chalk.bold('Performance'));
    console.log(`  Avg response:  ${avg.toFixed(0)}ms`);
    console.log(`  Min response:  ${min}ms`);
    console.log(`  Max response:  ${max}ms`);
    console.log(`  Slow (>1.5s):  ${responseTimes.filter((t) => t > 1500).length} pages`);
    console.log();
  }

  // Actionable summary
  printActionableSummary(summary);
}

const issueRecommendations: Record<string, { priority: string; fix: string }> = {
  'title-missing':            { priority: 'CRITICAL', fix: 'Add a unique <title> tag (30-60 chars) to each page' },
  'title-too-long':           { priority: 'HIGH', fix: 'Shorten titles to under 60 chars so they don\'t get truncated in SERPs' },
  'title-too-short':          { priority: 'MEDIUM', fix: 'Expand titles to at least 30 chars to improve CTR in search results' },
  'meta-description-missing': { priority: 'CRITICAL', fix: 'Add a meta description (70-160 chars) — Google uses it as the SERP snippet' },
  'meta-description-too-long':{ priority: 'HIGH', fix: 'Trim meta descriptions to 160 chars max — longer text gets cut off in SERPs' },
  'meta-description-too-short':{ priority: 'MEDIUM', fix: 'Expand meta descriptions to at least 70 chars for better SERP presence' },
  'h1-missing':               { priority: 'CRITICAL', fix: 'Add a single H1 tag — it\'s the main signal for page topic to search engines' },
  'h1-multiple':              { priority: 'MEDIUM', fix: 'Keep only one H1 per page — use H2-H6 for subsections' },
  'h1-empty':                 { priority: 'HIGH', fix: 'Add text content to empty H1 tags' },
  'canonical-missing':        { priority: 'HIGH', fix: 'Add <link rel="canonical"> to prevent duplicate content issues' },
  'canonical-mismatch':       { priority: 'HIGH', fix: 'Canonical URL should match the page URL, or intentionally point to the preferred version' },
  'canonical-different-domain':{ priority: 'HIGH', fix: 'Canonical pointing to another domain transfers all SEO value away from this page' },
  'img-missing-alt':          { priority: 'HIGH', fix: 'Add descriptive alt attributes to images for accessibility and image search' },
  'heading-skip':             { priority: 'MEDIUM', fix: 'Fix heading hierarchy (H1→H2→H3...) — don\'t skip levels' },
  'empty-links':              { priority: 'MEDIUM', fix: 'Replace empty href="#" links with real URLs or buttons' },
  'noindex-in-sitemap':       { priority: 'CRITICAL', fix: 'Remove noindex pages from sitemap, or remove the noindex directive if the page should be indexed' },
  'x-robots-noindex':         { priority: 'CRITICAL', fix: 'X-Robots-Tag header is blocking indexing — remove the header or take the URL out of the sitemap' },
  'blocked-by-robots-txt':    { priority: 'CRITICAL', fix: 'URL is disallowed in robots.txt but appears in sitemap — fix the conflict' },
  'nofollow-detected':        { priority: 'HIGH', fix: 'Remove nofollow if internal links should pass equity — usually only needed for user-generated content' },
  'thin-content':             { priority: 'HIGH', fix: 'Add more valuable content (300+ words) — thin pages are unlikely to rank' },
  'low-text-ratio':           { priority: 'MEDIUM', fix: 'Increase text content relative to HTML — reduce boilerplate, inline styles, and unnecessary markup' },
  'mixed-content':            { priority: 'HIGH', fix: 'Change all HTTP resource URLs to HTTPS to avoid browser security warnings' },
  'redirect-chain':           { priority: 'HIGH', fix: 'Reduce redirect hops to 1 max — each hop loses link equity and slows page load' },
  'redirect':                 { priority: 'MEDIUM', fix: 'Update sitemap to use the final destination URL instead of the redirect source' },
  'url-too-long':             { priority: 'MEDIUM', fix: 'Shorten URL to under 200 chars — shorter URLs are easier to share and may rank better' },
  'url-uppercase':            { priority: 'MEDIUM', fix: 'Use lowercase URLs only — uppercase can cause duplicate content issues' },
  'url-underscores':          { priority: 'LOW', fix: 'Google recommends hyphens over underscores in URLs for word separation' },
  'url-double-slash':         { priority: 'MEDIUM', fix: 'Remove double slashes from URL path — they can cause crawl issues' },
  'og-title-missing':         { priority: 'MEDIUM', fix: 'Add og:title for better social media link previews' },
  'og-description-missing':   { priority: 'MEDIUM', fix: 'Add og:description for better social media link previews' },
  'og-image-missing':         { priority: 'MEDIUM', fix: 'Add og:image — links shared on social media without an image get much less engagement' },
  'favicon-missing':          { priority: 'LOW', fix: 'Add a favicon — it appears in browser tabs and search results, improving brand visibility' },
  'viewport-missing':         { priority: 'CRITICAL', fix: 'Add <meta name="viewport"> — without it, mobile users see a broken layout and Google penalizes mobile ranking' },
  'lang-missing':             { priority: 'MEDIUM', fix: 'Add lang attribute to <html> tag for accessibility and search engine language detection' },
  'structured-data-missing':  { priority: 'LOW', fix: 'Add JSON-LD structured data for rich snippets in search results (stars, FAQs, breadcrumbs, etc.)' },
  'structured-data-invalid':  { priority: 'HIGH', fix: 'Fix invalid JSON-LD — broken structured data is worse than none' },
  'duplicate-title':          { priority: 'HIGH', fix: 'Make each page title unique — duplicate titles confuse search engines about which page to rank' },
  'duplicate-meta-description':{ priority: 'MEDIUM', fix: 'Write unique meta descriptions per page — duplicates reduce SERP click-through rate' },
  'duplicate-h1':             { priority: 'MEDIUM', fix: 'Make each page H1 unique to clearly differentiate page topics' },
  'hreflang-no-x-default':   { priority: 'MEDIUM', fix: 'Add hreflang="x-default" to specify the fallback page for unmatched languages' },
  'hreflang-no-self-reference':{ priority: 'MEDIUM', fix: 'Add a self-referencing hreflang tag — Google requires it for proper international targeting' },
  'orphan-page':              { priority: 'HIGH', fix: 'Add internal links from other pages to this URL — orphan pages are hard for Google to discover and rank' },
  'broken-internal-link':     { priority: 'CRITICAL', fix: 'Fix or remove links pointing to broken pages (4xx/5xx) — they waste crawl budget and break user experience' },
  'nofollow-internal-link':   { priority: 'HIGH', fix: 'Remove rel="nofollow" from internal links — it wastes PageRank that should flow within your site' },
  'generic-anchor-text':      { priority: 'MEDIUM', fix: 'Replace generic anchors ("click here", "read more") with descriptive text containing keywords' },
  'keyword-cannibalization':  { priority: 'HIGH', fix: 'Consolidate pages targeting the same keywords — merge content or differentiate titles/topics clearly' },
  'non-indexable-in-sitemap': { priority: 'HIGH', fix: 'Remove non-indexable URLs from sitemap — they waste crawl budget' },
  'low-inbound-links':        { priority: 'LOW', fix: 'Add more internal links to this page from related content to boost its authority' },
  'meta-refresh-redirect':    { priority: 'HIGH', fix: 'Replace meta refresh with a proper 301 redirect — meta refreshes are bad for SEO and user experience' },
  'dom-too-large':            { priority: 'HIGH', fix: 'Reduce DOM size below 1500 nodes — large DOMs slow rendering and hurt Core Web Vitals (LCP, INP)' },
  'dom-large':                { priority: 'MEDIUM', fix: 'Consider reducing DOM size — large DOMs can slow rendering and affect Core Web Vitals' },
  'http-error':               { priority: 'CRITICAL', fix: 'Fix or remove URLs returning 4xx/5xx errors from the sitemap' },
  'slow-response':            { priority: 'HIGH', fix: 'Page takes over 3s to respond — optimize server response time, caching, or infrastructure' },
  'moderate-response':        { priority: 'MEDIUM', fix: 'Page takes over 1.5s — consider server-side caching or CDN' },
  'page-too-large':           { priority: 'HIGH', fix: 'Page exceeds 3MB — reduce HTML size by removing inline assets, compressing content' },
  'twitter-card-missing':     { priority: 'LOW', fix: 'Add twitter:card meta tag for better Twitter/X link previews' },
};

function printActionableSummary(summary: CrawlSummary): void {
  const sortedIssues = Object.entries(summary.issuesByType).sort((a, b) => b[1] - a[1]);
  if (sortedIssues.length === 0) return;

  console.log(chalk.bold('═══════════════════════════════════════════════'));
  console.log(chalk.bold('  ACTIONABLE SUMMARY'));
  console.log(chalk.bold('═══════════════════════════════════════════════') + '\n');

  const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const priorityColor: Record<string, (s: string) => string> = {
    CRITICAL: chalk.bgRed.white.bold,
    HIGH: chalk.red.bold,
    MEDIUM: chalk.yellow,
    LOW: chalk.blue,
  };

  // Group issues by priority
  const grouped = new Map<string, { type: string; count: number; fix: string }[]>();
  for (const p of priorityOrder) grouped.set(p, []);

  for (const [type, count] of sortedIssues) {
    const rec = issueRecommendations[type];
    const priority = rec?.priority || 'MEDIUM';
    const fix = rec?.fix || 'Review and fix this issue';
    grouped.get(priority)!.push({ type, count, fix });
  }

  let rank = 1;
  for (const priority of priorityOrder) {
    const items = grouped.get(priority)!;
    if (items.length === 0) continue;

    console.log(priorityColor[priority](`  [${priority}]`));
    for (const item of items) {
      const pct = ((item.count / summary.totalUrls) * 100).toFixed(0);
      console.log(`  ${chalk.gray(`${rank}.`)} ${chalk.bold(item.type)} — ${item.count} pages (${pct}%)`);
      console.log(`     ${chalk.dim('→')} ${item.fix}`);
      rank++;
    }
    console.log();
  }

  // Final score
  const pagesWithNoErrors = summary.pages.filter(
    (p) => p.issues.filter((i) => i.severity === 'error').length === 0,
  ).length;
  const healthScore = Math.round((pagesWithNoErrors / summary.totalUrls) * 100);
  const scoreColor = healthScore >= 90 ? chalk.green : healthScore >= 70 ? chalk.yellow : chalk.red;
  console.log(chalk.bold('SEO Health Score: ') + scoreColor.bold(`${healthScore}%`) + chalk.gray(` (${pagesWithNoErrors}/${summary.totalUrls} pages with no errors)`));
  console.log();
}

export function exportCsv(summary: CrawlSummary, outputPath: string): void {
  const headers = [
    'URL', 'Final URL', 'Status', 'Response Time (ms)', 'Size (KB)',
    'Word Count', 'Text/HTML Ratio (%)', 'Indexable', 'Indexability Reason',
    'Severity', 'Issue Type', 'Issue Description',
    'Title', 'Meta Description', 'H1', 'Canonical', 'Internal Links Out',
  ];
  const rows: string[][] = [];

  for (const page of summary.pages) {
    const baseFields = [
      csvEscape(page.url),
      csvEscape(page.finalUrl),
      String(page.statusCode),
      String(page.responseTime),
      (page.contentLength / 1024).toFixed(1),
      String(page.wordCount),
      page.contentToHtmlRatio.toFixed(1),
      page.indexability,
      csvEscape(page.indexabilityReason || ''),
    ];
    const metaFields = [
      csvEscape(page.title || ''),
      csvEscape(page.metaDescription || ''),
      csvEscape(page.h1s.join(' | ')),
      csvEscape(page.canonical || ''),
      String(page.internalLinks.length),
    ];

    if (page.issues.length === 0) {
      rows.push([...baseFields, 'ok', 'no-issues', 'No SEO issues found', ...metaFields]);
    } else {
      for (const issue of page.issues) {
        rows.push([...baseFields, issue.severity, issue.type, csvEscape(issue.message), ...metaFields]);
      }
    }
  }

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const resolved = path.resolve(outputPath);
  fs.writeFileSync(resolved, csv, 'utf-8');
  console.log(chalk.green(`CSV report saved to ${resolved}`));
}

export function exportJson(summary: CrawlSummary, outputPath: string): void {
  const resolved = path.resolve(outputPath);
  fs.writeFileSync(resolved, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(chalk.green(`JSON report saved to ${resolved}`));
}

export function exportHtml(summary: CrawlSummary, outputPath: string): void {
  const resolved = path.resolve(outputPath);

  const issueRows = summary.pages
    .flatMap((p) =>
      p.issues.map((i) => ({ url: p.url, ...i })),
    )
    .sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEO Crawl Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 2rem; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { margin-bottom: 1.5rem; color: #1a1a1a; }
  h2 { margin: 2rem 0 1rem; color: #333; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card .number { font-size: 2rem; font-weight: bold; }
  .card .label { color: #666; margin-top: 0.25rem; }
  .error { color: #dc3545; }
  .warning { color: #ffc107; }
  .info { color: #17a2b8; }
  .ok { color: #28a745; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 600; position: sticky; top: 0; }
  tr:hover { background: #f8f9fa; }
  .severity { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
  .severity.error { background: #f8d7da; color: #721c24; }
  .severity.warning { background: #fff3cd; color: #856404; }
  .severity.info { background: #d1ecf1; color: #0c5460; }
  .url { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a { color: #007bff; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <h1>SEO Crawl Report</h1>
  <div class="summary">
    <div class="card"><div class="number">${summary.crawledUrls}</div><div class="label">Pages Crawled</div></div>
    <div class="card"><div class="number error">${summary.errors}</div><div class="label">Errors</div></div>
    <div class="card"><div class="number warning">${summary.warnings}</div><div class="label">Warnings</div></div>
    <div class="card"><div class="number info">${summary.infos}</div><div class="label">Info</div></div>
    <div class="card"><div class="number">${(summary.duration / 1000).toFixed(1)}s</div><div class="label">Duration</div></div>
  </div>

  <h2>Top Issues</h2>
  <table>
    <tr><th>Issue Type</th><th>Count</th></tr>
    ${Object.entries(summary.issuesByType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
      .join('\n    ')}
  </table>

  <h2>All Issues (${issueRows.length})</h2>
  <table>
    <tr><th>Severity</th><th>Type</th><th>URL</th><th>Message</th></tr>
    ${issueRows
      .map(
        (r) =>
          `<tr><td><span class="severity ${r.severity}">${r.severity}</span></td><td>${r.type}</td><td class="url"><a href="${escapeHtml(r.url)}" target="_blank">${escapeHtml(r.url)}</a></td><td>${escapeHtml(r.message)}</td></tr>`,
      )
      .join('\n    ')}
  </table>

  <h2>All Pages (${summary.pages.length})</h2>
  <table>
    <tr><th>URL</th><th>Status</th><th>Time</th><th>Size</th><th>Title</th><th>Issues</th></tr>
    ${summary.pages
      .map(
        (p) =>
          `<tr><td class="url"><a href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.url)}</a></td><td>${p.statusCode}</td><td>${p.responseTime}ms</td><td>${(p.contentLength / 1024).toFixed(0)}KB</td><td>${escapeHtml(p.title || '—')}</td><td>${p.issues.length}</td></tr>`,
      )
      .join('\n    ')}
  </table>
</div>
</body>
</html>`;

  fs.writeFileSync(resolved, html, 'utf-8');
  console.log(chalk.green(`HTML report saved to ${resolved}`));
}

function getSeverityForType(type: string, pages: PageResult[]): string {
  for (const page of pages) {
    for (const issue of page.issues) {
      if (issue.type === type) return issue.severity;
    }
  }
  return 'info';
}

function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
