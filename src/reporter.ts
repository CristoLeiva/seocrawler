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
}

export function exportCsv(summary: CrawlSummary, outputPath: string): void {
  const headers = [
    'URL', 'Final URL', 'Status', 'Response Time (ms)', 'Size (KB)',
    'Word Count', 'Text/HTML Ratio (%)',
    'Severity', 'Issue Type', 'Issue Description',
    'Title', 'Meta Description', 'H1', 'Canonical',
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
    ];
    const metaFields = [
      csvEscape(page.title || ''),
      csvEscape(page.metaDescription || ''),
      csvEscape(page.h1s.join(' | ')),
      csvEscape(page.canonical || ''),
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
