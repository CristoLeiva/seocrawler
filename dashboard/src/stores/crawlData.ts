import { ref, computed, provide, inject } from 'vue';
import type { CrawlSummary, PageResult, Severity } from '../types';

const STORE_KEY = Symbol('crawlData');

export function createCrawlStore() {
  const data = ref<CrawlSummary | null>(null);
  const selectedPage = ref<PageResult | null>(null);
  const activeIssueFilter = ref<string | null>(null);
  const searchQuery = ref('');
  const severityFilter = ref<Severity | 'all'>('all');
  const sortKey = ref<string>('issues');
  const sortDir = ref<'asc' | 'desc'>('desc');

  const healthScore = computed(() => {
    if (!data.value) return 0;
    const noErrors = data.value.pages.filter(
      (p) => p.issues.filter((i) => i.severity === 'error').length === 0,
    ).length;
    return Math.round((noErrors / data.value.totalUrls) * 100);
  });

  const filteredPages = computed(() => {
    if (!data.value) return [];
    let pages = data.value.pages;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      pages = pages.filter(
        (p) =>
          p.url.toLowerCase().includes(q) ||
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.h1s.length > 0 && p.h1s[0].toLowerCase().includes(q)),
      );
    }

    if (severityFilter.value !== 'all') {
      pages = pages.filter((p) =>
        p.issues.some((i) => i.severity === severityFilter.value),
      );
    }

    if (activeIssueFilter.value) {
      pages = pages.filter((p) =>
        p.issues.some((i) => i.type === activeIssueFilter.value),
      );
    }

    // Sort
    const key = sortKey.value;
    const dir = sortDir.value === 'asc' ? 1 : -1;
    pages = [...pages].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (key) {
        case 'url': va = a.url; vb = b.url; break;
        case 'status': va = a.statusCode; vb = b.statusCode; break;
        case 'responseTime': va = a.responseTime; vb = b.responseTime; break;
        case 'contentLength': va = a.contentLength; vb = b.contentLength; break;
        case 'wordCount': va = a.wordCount; vb = b.wordCount; break;
        case 'issues': va = a.issues.length; vb = b.issues.length; break;
        case 'indexability': va = a.indexability; vb = b.indexability; break;
        default: va = a.issues.length; vb = b.issues.length;
      }
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });

    return pages;
  });

  const issuesSummary = computed(() => {
    if (!data.value) return [];
    return Object.entries(data.value.issuesByType)
      .map(([type, count]) => {
        // find severity from first occurrence
        let severity: Severity = 'info';
        for (const page of data.value!.pages) {
          const found = page.issues.find((i) => i.type === type);
          if (found) { severity = found.severity; break; }
        }
        return { type, count, severity };
      })
      .sort((a, b) => b.count - a.count);
  });

  function loadData(summary: CrawlSummary) {
    data.value = summary;
    selectedPage.value = null;
    activeIssueFilter.value = null;
    searchQuery.value = '';
    severityFilter.value = 'all';
  }

  function toggleSort(key: string) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey.value = key;
      sortDir.value = key === 'url' ? 'asc' : 'desc';
    }
  }

  const store = {
    data,
    selectedPage,
    activeIssueFilter,
    searchQuery,
    severityFilter,
    sortKey,
    sortDir,
    healthScore,
    filteredPages,
    issuesSummary,
    loadData,
    toggleSort,
  };

  return store;
}

export type CrawlStore = ReturnType<typeof createCrawlStore>;

export function provideCrawlStore(store: CrawlStore) {
  provide(STORE_KEY, store);
}

export function useCrawlStore(): CrawlStore {
  const store = inject<CrawlStore>(STORE_KEY);
  if (!store) throw new Error('CrawlStore not provided');
  return store;
}
