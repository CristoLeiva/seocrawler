import { parseStringPromise } from 'xml2js';
import { SitemapEntry } from './types';

export async function fetchSitemap(url: string, userAgent: string): Promise<SitemapEntry[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap ${url}: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  // Handle sitemap index (nested sitemaps)
  if (parsed.sitemapindex) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    const entries: SitemapEntry[] = [];
    for (const sitemap of sitemaps) {
      const childUrl = sitemap.loc;
      console.log(`  Found child sitemap: ${childUrl}`);
      try {
        const childEntries = await fetchSitemap(childUrl, userAgent);
        entries.push(...childEntries);
      } catch (err) {
        console.error(`  Failed to fetch child sitemap ${childUrl}: ${(err as Error).message}`);
      }
    }
    return entries;
  }

  // Handle regular sitemap
  if (parsed.urlset) {
    if (!parsed.urlset.url) return [];
    const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
    return urls.map((u: Record<string, string>) => ({
      loc: u.loc,
      lastmod: u.lastmod,
      changefreq: u.changefreq,
      priority: u.priority,
    }));
  }

  throw new Error(`Unknown sitemap format at ${url}`);
}
