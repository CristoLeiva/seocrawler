#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { fetchSitemap } from './sitemap';
import { crawlPages, fetchRobotsTxt } from './crawler';
import { findCrossPageIssues } from './analyzers';
import { buildSummary, printReport, exportCsv, exportHtml } from './reporter';
import { CrawlOptions } from './types';

const program = new Command();

program
  .name('seocrawler')
  .description('SEO crawler and analyzer — find SEO issues across your website')
  .version('1.0.0')
  .argument('<sitemap-url>', 'URL of the sitemap.xml to crawl')
  .option('-c, --concurrency <number>', 'number of concurrent requests', '5')
  .option('-t, --timeout <ms>', 'request timeout in milliseconds', '10000')
  .option('-u, --user-agent <string>', 'custom user agent', 'SEOCrawler/1.0')
  .option('-o, --output <path>', 'export report to CSV file')
  .option('--html <path>', 'export report to HTML file')
  .option('--limit <number>', 'limit the number of URLs to crawl')
  .action(async (sitemapUrl: string, opts) => {
    const options: CrawlOptions = {
      concurrency: parseInt(opts.concurrency, 10),
      timeout: parseInt(opts.timeout, 10),
      userAgent: opts.userAgent,
      checkExternalLinks: false,
      output: opts.output,
    };

    console.log(chalk.bold('\n🔍 SEO Crawler\n'));
    console.log(`  Sitemap:      ${sitemapUrl}`);
    console.log(`  Concurrency:  ${options.concurrency}`);
    console.log(`  Timeout:      ${options.timeout}ms`);
    console.log();

    // Step 1: Fetch robots.txt
    console.log(chalk.bold('Fetching robots.txt...'));
    const robotsTxt = await fetchRobotsTxt(sitemapUrl, options.userAgent);
    if (robotsTxt) {
      console.log(chalk.green(`  Found robots.txt (${robotsTxt.disallowedPaths.length} disallow rules)`));
    } else {
      console.log(chalk.yellow('  No robots.txt found'));
    }

    // Step 2: Fetch sitemap
    console.log(chalk.bold('\nFetching sitemap...'));
    let entries;
    try {
      entries = await fetchSitemap(sitemapUrl, options.userAgent);
    } catch (err) {
      console.error(chalk.red(`\nFailed to fetch sitemap: ${(err as Error).message}`));
      process.exit(1);
    }

    if (entries.length === 0) {
      console.log(chalk.yellow('No URLs found in sitemap.'));
      process.exit(0);
    }

    const limit = opts.limit ? parseInt(opts.limit, 10) : entries.length;
    if (limit < entries.length) {
      entries = entries.slice(0, limit);
      console.log(`  Limiting to ${limit} URLs`);
    }

    console.log(chalk.green(`  Found ${entries.length} URL(s)\n`));

    // Step 3: Crawl pages
    console.log(chalk.bold('Crawling pages...'));
    const startTime = Date.now();
    const pages = await crawlPages(entries, options, robotsTxt);
    const duration = Date.now() - startTime;

    // Step 4: Cross-page analysis
    const crossPageIssues = findCrossPageIssues(pages);
    if (crossPageIssues.length > 0) {
      console.log(chalk.bold('\nCross-page issues:'));
      for (const issue of crossPageIssues) {
        console.log(`  ${chalk.yellow('!')} ${issue.message}`);
      }
    }

    // Step 5: Build summary and print report
    const summary = buildSummary(pages, duration);
    summary.totalIssues += crossPageIssues.length;
    summary.warnings += crossPageIssues.filter((i) => i.severity === 'warning').length;

    printReport(summary);

    // Step 6: Export if requested
    if (opts.output) {
      exportCsv(summary, opts.output);
    }
    if (opts.html) {
      exportHtml(summary, opts.html);
    }
  });

program.parse();
