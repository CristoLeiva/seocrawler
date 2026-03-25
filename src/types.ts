export type Severity = 'error' | 'warning' | 'info';

export interface SeoIssue {
  type: string;
  severity: Severity;
  message: string;
}

export interface PageResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  responseTime: number;
  contentLength: number;
  wordCount: number;
  contentToHtmlRatio: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1s: string[];
  xRobotsTag: string | null;
  issues: SeoIssue[];
}

export interface CrawlOptions {
  concurrency: number;
  timeout: number;
  userAgent: string;
  checkExternalLinks: boolean;
  output?: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface RobotsTxt {
  disallowedPaths: string[];
  raw: string;
}

export interface CrawlSummary {
  totalUrls: number;
  crawledUrls: number;
  totalIssues: number;
  errors: number;
  warnings: number;
  infos: number;
  issuesByType: Record<string, number>;
  pages: PageResult[];
  duration: number;
}
