import express from 'express';
import cors from 'cors';
import { fetchSitemap } from './sitemap';
import { crawlPages, fetchRobotsTxt } from './crawler';
import { findCrossPageIssues } from './analyzers';
import { buildSummary } from './reporter';
import { CrawlOptions } from './types';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/crawl', async (req, res) => {
  const sitemapUrl = req.query.url as string;
  const concurrency = parseInt((req.query.concurrency as string) || '5', 10);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  if (!sitemapUrl) {
    res.status(400).json({ error: 'Missing url query parameter' });
    return;
  }

  // Validate URL
  try {
    new URL(sitemapUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const options: CrawlOptions = {
    concurrency,
    timeout: 10000,
    userAgent: 'SEOCrawler/1.0',
    checkExternalLinks: false,
  };

  try {
    // Step 1: Fetch robots.txt
    send('status', { phase: 'robots', message: 'Fetching robots.txt...' });
    const robotsTxt = await fetchRobotsTxt(sitemapUrl, options.userAgent);
    send('status', {
      phase: 'robots',
      message: robotsTxt
        ? `Found robots.txt (${robotsTxt.disallowedPaths.length} disallow rules)`
        : 'No robots.txt found',
    });

    // Step 2: Fetch sitemap
    send('status', { phase: 'sitemap', message: 'Fetching sitemap...' });
    let entries = await fetchSitemap(sitemapUrl, options.userAgent);

    if (entries.length === 0) {
      send('error', { message: 'No URLs found in sitemap' });
      res.end();
      return;
    }

    if (limit && limit < entries.length) {
      entries = entries.slice(0, limit);
    }

    send('status', { phase: 'sitemap', message: `Found ${entries.length} URL(s)` });

    // Step 3: Crawl
    send('status', { phase: 'crawling', message: `Crawling ${entries.length} pages...` });
    const startTime = Date.now();

    const pages = await crawlPages(entries, options, robotsTxt, (progress) => {
      send('progress', progress);
    });

    const duration = Date.now() - startTime;

    // Step 4: Cross-page analysis
    send('status', { phase: 'analysis', message: 'Running cross-page analysis...' });
    const crossPageIssues = findCrossPageIssues(pages);

    // Step 5: Build summary
    const summary = buildSummary(pages, duration);
    summary.crossPageIssues = crossPageIssues;
    summary.totalIssues += crossPageIssues.length;
    summary.warnings += crossPageIssues.filter((i) => i.severity === 'warning').length;

    send('complete', summary);
  } catch (err) {
    send('error', { message: (err as Error).message });
  }

  res.end();
});

const PORT = parseInt(process.env.PORT || '3457', 10);
app.listen(PORT, () => {
  console.log(`SEO Crawler API running on http://localhost:${PORT}`);
});
