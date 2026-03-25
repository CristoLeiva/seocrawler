import * as cheerio from 'cheerio';
import { SeoIssue, PageResult, RobotsTxt } from './types';

interface AnalyzeOptions {
  robotsTxt?: RobotsTxt;
}

export function analyzePage(
  url: string,
  finalUrl: string,
  html: string,
  statusCode: number,
  responseTime: number,
  redirectChain: string[],
  xRobotsTag: string | null,
  options: AnalyzeOptions = {},
): PageResult {
  const $ = cheerio.load(html);
  const issues: SeoIssue[] = [];

  // --- Title ---
  const title = $('title').first().text().trim() || null;
  if (!title) {
    issues.push({ type: 'title-missing', severity: 'error', message: 'Page has no <title> tag' });
  } else {
    if (title.length < 30) {
      issues.push({ type: 'title-too-short', severity: 'warning', message: `Title is too short (${title.length} chars): "${title}"` });
    }
    if (title.length > 60) {
      issues.push({ type: 'title-too-long', severity: 'warning', message: `Title is too long (${title.length} chars): "${title.substring(0, 70)}..."` });
    }
  }

  // --- Meta Description ---
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  if (!metaDescription) {
    issues.push({ type: 'meta-description-missing', severity: 'error', message: 'Page has no meta description' });
  } else {
    if (metaDescription.length < 70) {
      issues.push({ type: 'meta-description-too-short', severity: 'warning', message: `Meta description is too short (${metaDescription.length} chars): "${metaDescription}"` });
    }
    if (metaDescription.length > 160) {
      issues.push({ type: 'meta-description-too-long', severity: 'warning', message: `Meta description is too long (${metaDescription.length} chars): "${metaDescription.substring(0, 80)}..."` });
    }
  }

  // --- H1 ---
  const h1Elements = $('h1');
  const h1s = h1Elements.map((_, el) => $(el).text().trim()).get();
  if (h1s.length === 0) {
    issues.push({ type: 'h1-missing', severity: 'error', message: 'Page has no H1 tag' });
  } else if (h1s.length > 1) {
    issues.push({ type: 'h1-multiple', severity: 'warning', message: `Page has ${h1s.length} H1 tags` });
  }
  h1s.forEach((h1, i) => {
    if (!h1) {
      issues.push({ type: 'h1-empty', severity: 'error', message: `H1 #${i + 1} is empty` });
    }
  });

  // --- Canonical ---
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  if (!canonical) {
    issues.push({ type: 'canonical-missing', severity: 'warning', message: 'Page has no canonical URL' });
  } else {
    try {
      const resolvedCanonical = new URL(canonical, url).href;
      const canonicalHost = new URL(resolvedCanonical).hostname;
      const pageHost = new URL(url).hostname;
      if (canonicalHost !== pageHost) {
        issues.push({ type: 'canonical-different-domain', severity: 'warning', message: `Canonical points to different domain: ${resolvedCanonical}` });
      } else if (resolvedCanonical !== url && resolvedCanonical !== finalUrl) {
        issues.push({ type: 'canonical-mismatch', severity: 'warning', message: `Canonical URL differs from page URL: ${resolvedCanonical}` });
      }
    } catch {
      issues.push({ type: 'canonical-invalid', severity: 'error', message: `Invalid canonical URL: ${canonical}` });
    }
  }

  // --- Images ---
  const images = $('img');
  let imagesWithoutAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) {
      imagesWithoutAlt++;
    }
  });
  if (imagesWithoutAlt > 0) {
    issues.push({ type: 'img-missing-alt', severity: 'error', message: `${imagesWithoutAlt} image(s) missing alt attribute` });
  }

  // --- Open Graph ---
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (!ogTitle) {
    issues.push({ type: 'og-title-missing', severity: 'warning', message: 'Missing og:title meta tag' });
  }
  if (!ogDescription) {
    issues.push({ type: 'og-description-missing', severity: 'warning', message: 'Missing og:description meta tag' });
  }
  if (!ogImage) {
    issues.push({ type: 'og-image-missing', severity: 'warning', message: 'Missing og:image meta tag' });
  }

  // --- Twitter Card ---
  const twitterCard = $('meta[name="twitter:card"]').attr('content');
  if (!twitterCard) {
    issues.push({ type: 'twitter-card-missing', severity: 'info', message: 'Missing twitter:card meta tag' });
  }

  // --- Robots Meta ---
  const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  if (robotsMeta.includes('noindex')) {
    issues.push({ type: 'noindex-in-sitemap', severity: 'error', message: 'Page has noindex directive but is in sitemap' });
  }
  if (robotsMeta.includes('nofollow')) {
    issues.push({ type: 'nofollow-detected', severity: 'warning', message: 'Page has nofollow directive — internal links won\'t pass equity' });
  }

  // --- X-Robots-Tag Header ---
  if (xRobotsTag) {
    const lower = xRobotsTag.toLowerCase();
    if (lower.includes('noindex')) {
      issues.push({ type: 'x-robots-noindex', severity: 'error', message: `X-Robots-Tag header contains noindex: "${xRobotsTag}"` });
    }
  }

  // --- Robots.txt Compliance ---
  if (options.robotsTxt) {
    const urlPath = new URL(url).pathname;
    for (const disallowed of options.robotsTxt.disallowedPaths) {
      if (urlPath.startsWith(disallowed)) {
        issues.push({ type: 'blocked-by-robots-txt', severity: 'error', message: `URL path "${urlPath}" is blocked by robots.txt rule: Disallow: ${disallowed}` });
        break;
      }
    }
  }

  // --- Redirect Chain ---
  if (redirectChain.length > 0) {
    if (redirectChain.length > 2) {
      issues.push({ type: 'redirect-chain', severity: 'error', message: `Redirect chain with ${redirectChain.length} hops: ${redirectChain.join(' → ')} → ${finalUrl}` });
    } else if (redirectChain.length > 0) {
      issues.push({ type: 'redirect', severity: 'warning', message: `Page redirects (${redirectChain.length} hop): ${redirectChain[0]} → ${finalUrl}` });
    }
  }

  // --- Structured Data ---
  const jsonLdScripts = $('script[type="application/ld+json"]');
  if (jsonLdScripts.length === 0) {
    issues.push({ type: 'structured-data-missing', severity: 'info', message: 'No JSON-LD structured data found' });
  } else {
    jsonLdScripts.each((_, el) => {
      try {
        JSON.parse($(el).html() || '');
      } catch {
        issues.push({ type: 'structured-data-invalid', severity: 'error', message: 'Invalid JSON-LD structured data' });
      }
    });
  }

  // --- Hreflang ---
  const hreflangs = $('link[rel="alternate"][hreflang]');
  if (hreflangs.length > 0) {
    const langs = hreflangs.map((_, el) => $(el).attr('hreflang')).get();
    if (!langs.includes('x-default')) {
      issues.push({ type: 'hreflang-no-x-default', severity: 'warning', message: 'Hreflang tags present but no x-default' });
    }
    const selfRef = hreflangs.filter((_, el) => {
      const href = $(el).attr('href');
      return href === url || href === finalUrl;
    });
    if (selfRef.length === 0) {
      issues.push({ type: 'hreflang-no-self-reference', severity: 'warning', message: 'Hreflang tags present but no self-referencing tag' });
    }
  }

  // --- Heading Hierarchy ---
  const headingLevels: number[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    headingLevels.push(parseInt(el.tagName.replace('h', ''), 10));
  });
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) {
      issues.push({
        type: 'heading-skip',
        severity: 'warning',
        message: `Heading hierarchy skips from H${headingLevels[i - 1]} to H${headingLevels[i]}`,
      });
      break;
    }
  }

  // --- Viewport Meta ---
  const viewport = $('meta[name="viewport"]').attr('content');
  if (!viewport) {
    issues.push({ type: 'viewport-missing', severity: 'error', message: 'Missing viewport meta tag (mobile-unfriendly)' });
  }

  // --- Lang Attribute ---
  const htmlLang = $('html').attr('lang');
  if (!htmlLang) {
    issues.push({ type: 'lang-missing', severity: 'warning', message: 'HTML element missing lang attribute' });
  }

  // --- Favicon ---
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"]');
  if (favicon.length === 0) {
    issues.push({ type: 'favicon-missing', severity: 'warning', message: 'No favicon link tag found' });
  }

  // --- URL Analysis ---
  analyzeUrl(url, issues);

  // --- Content Analysis ---
  // Extract visible text (strip scripts, styles, nav, footer, header)
  const contentClone = $.root().clone();
  contentClone.find('script, style, nav, footer, header, noscript, iframe').remove();
  const visibleText = contentClone.text().replace(/\s+/g, ' ').trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).length : 0;

  const htmlLength = html.length;
  const textLength = visibleText.length;
  const contentToHtmlRatio = htmlLength > 0 ? (textLength / htmlLength) * 100 : 0;

  if (wordCount < 300) {
    issues.push({ type: 'thin-content', severity: 'warning', message: `Thin content: only ${wordCount} words (recommended: 300+)` });
  }

  if (contentToHtmlRatio < 10) {
    issues.push({ type: 'low-text-ratio', severity: 'warning', message: `Low text-to-HTML ratio: ${contentToHtmlRatio.toFixed(1)}% (recommended: 10%+)` });
  }

  // --- Mixed Content (HTTP resources on HTTPS page) ---
  if (url.startsWith('https://')) {
    let mixedContentCount = 0;
    $('img[src^="http://"], script[src^="http://"], link[href^="http://"], iframe[src^="http://"]').each(() => {
      mixedContentCount++;
    });
    if (mixedContentCount > 0) {
      issues.push({ type: 'mixed-content', severity: 'error', message: `${mixedContentCount} resource(s) loaded over insecure HTTP on HTTPS page` });
    }
  }

  // --- Performance ---
  const contentLength = Buffer.byteLength(html, 'utf-8');
  if (contentLength > 3 * 1024 * 1024) {
    issues.push({ type: 'page-too-large', severity: 'error', message: `Page is very large (${(contentLength / 1024 / 1024).toFixed(1)}MB)` });
  } else if (contentLength > 1024 * 1024) {
    issues.push({ type: 'page-large', severity: 'warning', message: `Page is large (${(contentLength / 1024).toFixed(0)}KB)` });
  }

  if (responseTime > 3000) {
    issues.push({ type: 'slow-response', severity: 'error', message: `Slow response time: ${responseTime}ms` });
  } else if (responseTime > 1500) {
    issues.push({ type: 'moderate-response', severity: 'warning', message: `Moderate response time: ${responseTime}ms` });
  }

  // --- Links ---
  const links = $('a[href]');
  let emptyLinks = 0;
  links.each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href === '#') {
      emptyLinks++;
    }
  });
  if (emptyLinks > 0) {
    issues.push({ type: 'empty-links', severity: 'warning', message: `${emptyLinks} empty or hash-only link(s)` });
  }

  return {
    url,
    finalUrl,
    statusCode,
    redirectChain,
    responseTime,
    contentLength,
    wordCount,
    contentToHtmlRatio,
    title,
    metaDescription,
    canonical,
    h1s,
    xRobotsTag,
    issues,
  };
}

function analyzeUrl(url: string, issues: SeoIssue[]): void {
  const parsed = new URL(url);
  const path = parsed.pathname;

  // URL too long
  if (url.length > 200) {
    issues.push({ type: 'url-too-long', severity: 'warning', message: `URL is too long (${url.length} chars, recommended: <200)` });
  }

  // Uppercase in URL
  if (path !== path.toLowerCase()) {
    issues.push({ type: 'url-uppercase', severity: 'warning', message: `URL path contains uppercase characters: ${path}` });
  }

  // Double slashes in path
  if (path.includes('//')) {
    issues.push({ type: 'url-double-slash', severity: 'warning', message: `URL path contains double slashes: ${path}` });
  }

  // Underscores (Google prefers hyphens)
  if (path.includes('_')) {
    issues.push({ type: 'url-underscores', severity: 'info', message: `URL uses underscores instead of hyphens: ${path}` });
  }

  // Special/encoded characters
  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    issues.push({ type: 'url-encoded-chars', severity: 'info', message: `URL contains encoded characters: ${path}` });
  }

  // Excessive depth (more than 5 path segments)
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 5) {
    issues.push({ type: 'url-deep-path', severity: 'warning', message: `URL has ${segments.length} path segments (recommended: <=5)` });
  }
}

export function findCrossPageIssues(pages: PageResult[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  const h1Map = new Map<string, string[]>();

  for (const page of pages) {
    if (page.title) {
      const urls = titles.get(page.title) || [];
      urls.push(page.url);
      titles.set(page.title, urls);
    }
    if (page.metaDescription) {
      const urls = descriptions.get(page.metaDescription) || [];
      urls.push(page.url);
      descriptions.set(page.metaDescription, urls);
    }
    if (page.h1s.length > 0) {
      const h1Text = page.h1s[0];
      if (h1Text) {
        const urls = h1Map.get(h1Text) || [];
        urls.push(page.url);
        h1Map.set(h1Text, urls);
      }
    }
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      issues.push({
        type: 'duplicate-title',
        severity: 'warning',
        message: `Duplicate title "${title.substring(0, 60)}..." on ${urls.length} pages: ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ` (+${urls.length - 3} more)` : ''}`,
      });
    }
  }

  for (const [desc, urls] of descriptions) {
    if (urls.length > 1) {
      issues.push({
        type: 'duplicate-meta-description',
        severity: 'warning',
        message: `Duplicate meta description on ${urls.length} pages: "${desc.substring(0, 50)}..." — ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ` (+${urls.length - 3} more)` : ''}`,
      });
    }
  }

  for (const [h1, urls] of h1Map) {
    if (urls.length > 1) {
      issues.push({
        type: 'duplicate-h1',
        severity: 'warning',
        message: `Duplicate H1 "${h1.substring(0, 60)}..." on ${urls.length} pages: ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ` (+${urls.length - 3} more)` : ''}`,
      });
    }
  }

  return issues;
}
