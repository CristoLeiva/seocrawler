<script setup lang="ts">
import { ref } from 'vue';
import type { CrawlSummary, PageResult, Severity, SeoIssue } from '../types';

const emit = defineEmits<{ loaded: [data: CrawlSummary] }>();
const dragging = ref(false);
const error = ref('');
const fileInput = ref<HTMLInputElement>();

// URL crawl state
const sitemapUrl = ref('');
const concurrency = ref(5);
const limitPages = ref<number | undefined>(undefined);
const isCrawling = ref(false);
const crawlPhase = ref('');
const crawlProgress = ref({ completed: 0, total: 0 });
const crawlLog = ref<{ url: string; status: number; issues: number; errors: number; time: number }[]>([]);

async function startCrawl() {
  if (!sitemapUrl.value) return;
  error.value = '';
  isCrawling.value = true;
  crawlPhase.value = 'Starting...';
  crawlProgress.value = { completed: 0, total: 0 };
  crawlLog.value = [];

  const params = new URLSearchParams({
    url: sitemapUrl.value,
    concurrency: String(concurrency.value),
  });
  if (limitPages.value) {
    params.set('limit', String(limitPages.value));
  }

  try {
    const evtSource = new EventSource(`/api/crawl?${params}`);

    evtSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      crawlPhase.value = data.message;
    });

    evtSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      crawlProgress.value = { completed: data.completed, total: data.total };
      crawlLog.value.push({
        url: data.url,
        status: data.statusCode,
        issues: data.issues,
        errors: data.errors,
        time: data.responseTime,
      });
    });

    evtSource.addEventListener('complete', (e) => {
      const summary = JSON.parse(e.data) as CrawlSummary;
      evtSource.close();
      isCrawling.value = false;
      emit('loaded', summary);
    });

    evtSource.addEventListener('error', (e) => {
      // Check if it's a message event with data
      const msgEvent = e as MessageEvent;
      if (msgEvent.data) {
        const data = JSON.parse(msgEvent.data);
        error.value = data.message || 'Crawl failed';
      } else {
        error.value = 'Connection to server lost — is the API server running? (npx ts-node src/server.ts)';
      }
      evtSource.close();
      isCrawling.value = false;
    });
  } catch (err) {
    error.value = `Failed to start crawl: ${(err as Error).message}`;
    isCrawling.value = false;
  }
}

// File upload handling
function handleFile(file: File) {
  error.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') parseJson(content);
    else if (ext === 'csv') parseCsv(content);
    else error.value = 'Unsupported file format — use .json or .csv';
  };
  reader.readAsText(file);
}

function parseJson(content: string) {
  try {
    const json = JSON.parse(content);
    if (!json.pages || !json.totalUrls || json.duration === undefined) {
      error.value = 'Invalid JSON format';
      return;
    }
    emit('loaded', json as CrawlSummary);
  } catch { error.value = 'Failed to parse JSON file'; }
}

function parseCsvFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content: string) {
  try {
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length < 2) { error.value = 'CSV file is empty'; return; }
    const headers = parseCsvFields(lines[0]);
    const col = (name: string) => headers.indexOf(name);
    if (col('URL') === -1 || col('Severity') === -1) {
      error.value = 'Invalid CSV format'; return;
    }
    const pageMap = new Map<string, string[][]>();
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvFields(lines[i]);
      const url = fields[col('URL')];
      if (!url) continue;
      if (!pageMap.has(url)) pageMap.set(url, []);
      pageMap.get(url)!.push(fields);
    }
    const pages: PageResult[] = [];
    let totalErrors = 0, totalWarnings = 0, totalInfos = 0;
    const issuesByType: Record<string, number> = {};
    for (const [url, rows] of pageMap) {
      const first = rows[0];
      const issues: SeoIssue[] = [];
      for (const row of rows) {
        const severity = row[col('Severity')] as Severity;
        const issueType = row[col('Issue Type')];
        const message = row[col('Issue Description')] || '';
        if ((severity === 'error' || severity === 'warning' || severity === 'info') && issueType !== 'no-issues') {
          issues.push({ type: issueType, severity, message });
          issuesByType[issueType] = (issuesByType[issueType] || 0) + 1;
          if (severity === 'error') totalErrors++;
          else if (severity === 'warning') totalWarnings++;
          else totalInfos++;
        }
      }
      const page: PageResult = {
        url,
        finalUrl: first[col('Final URL')] || url,
        statusCode: parseInt(first[col('Status')] || '0', 10),
        redirectChain: [],
        responseTime: parseInt(first[col('Response Time (ms)')] || '0', 10),
        contentLength: parseFloat(first[col('Size (KB)')] || '0') * 1024,
        wordCount: parseInt(first[col('Word Count')] || '0', 10),
        contentToHtmlRatio: parseFloat(first[col('Text/HTML Ratio (%)')] || '0'),
        title: first[col('Title')] || null,
        metaDescription: first[col('Meta Description')] || null,
        canonical: first[col('Canonical')] || null,
        h1s: first[col('H1')] ? first[col('H1')].split(' | ') : [],
        xRobotsTag: null, internalLinks: [], internalLinkDetails: [],
        indexability: (first[col('Indexable')] || 'indexable') as 'indexable' | 'non-indexable',
        indexabilityReason: first[col('Indexability Reason')] || null,
        issues,
      };
      const linksOut = col('Internal Links Out');
      if (linksOut !== -1 && first[linksOut]) page.internalLinks = new Array(parseInt(first[linksOut], 10)).fill('');
      pages.push(page);
    }
    const crossPageIssues: SeoIssue[] = [];
    const crossTypes = ['duplicate-title', 'duplicate-meta-description', 'duplicate-h1', 'keyword-cannibalization', 'orphan-page', 'non-indexable-in-sitemap'];
    const seen = new Set<string>();
    for (const page of pages) {
      for (const issue of page.issues) {
        const key = issue.type + ':' + issue.message;
        if (crossTypes.includes(issue.type) && !seen.has(key)) {
          crossPageIssues.push(issue); seen.add(key);
        }
      }
    }
    emit('loaded', {
      totalUrls: pages.length, crawledUrls: pages.filter((p) => p.statusCode > 0).length,
      totalIssues: totalErrors + totalWarnings + totalInfos,
      errors: totalErrors, warnings: totalWarnings, infos: totalInfos,
      issuesByType, crossPageIssues, pages, duration: 0,
    });
  } catch (e) { error.value = `Failed to parse CSV: ${(e as Error).message}`; }
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
}
function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
}
function openPicker() { fileInput.value?.click(); }
</script>

<template>
  <div class="file-loader">
    <h1>SEO Crawler Dashboard</h1>
    <p>Analyze any website's SEO directly from here</p>

    <!-- URL Input -->
    <div class="crawl-form" v-if="!isCrawling">
      <div class="url-input-row">
        <input
          v-model="sitemapUrl"
          type="url"
          placeholder="https://example.com/sitemap.xml"
          class="url-input"
          @keydown.enter="startCrawl"
        />
        <button class="crawl-btn" @click="startCrawl" :disabled="!sitemapUrl">
          Analyze
        </button>
      </div>
      <div class="crawl-options">
        <label>
          Concurrency
          <select v-model.number="concurrency">
            <option :value="3">3</option>
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
          </select>
        </label>
        <label>
          Limit pages
          <input v-model.number="limitPages" type="number" min="1" placeholder="All" style="width: 80px;" />
        </label>
      </div>
    </div>

    <!-- Crawl Progress -->
    <div class="crawl-progress" v-if="isCrawling">
      <div class="progress-header">
        <div class="progress-phase">{{ crawlPhase }}</div>
        <div class="progress-count" v-if="crawlProgress.total > 0">
          {{ crawlProgress.completed }} / {{ crawlProgress.total }}
        </div>
      </div>
      <div class="progress-bar-wrap" v-if="crawlProgress.total > 0">
        <div
          class="progress-bar-fill"
          :style="{ width: `${(crawlProgress.completed / crawlProgress.total) * 100}%` }"
        />
      </div>
      <div class="progress-log" v-if="crawlLog.length > 0">
        <div
          v-for="(entry, i) in crawlLog.slice(-8).reverse()"
          :key="i"
          class="log-entry"
          :class="{ error: entry.status >= 400 || entry.status === 0 }"
        >
          <span class="log-status" :class="entry.status >= 400 ? 'red' : entry.status >= 300 ? 'yellow' : 'green'">
            {{ entry.status || 'ERR' }}
          </span>
          <span class="log-url">{{ entry.url }}</span>
          <span class="log-issues" v-if="entry.errors > 0" style="color: var(--color-error);">{{ entry.errors }}E</span>
          <span class="log-issues" v-else-if="entry.issues > 0" style="color: var(--color-warning);">{{ entry.issues }}W</span>
          <span class="log-issues" v-else style="color: var(--color-success);">OK</span>
          <span class="log-time">{{ entry.time }}ms</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="divider" v-if="!isCrawling">
      <span>or load an existing report</span>
    </div>

    <!-- File Upload -->
    <div
      v-if="!isCrawling"
      class="drop-zone"
      :class="{ dragging }"
      @click="openPicker"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="text">
        <strong>Click to upload</strong> or drag & drop a <code>.csv</code> or <code>.json</code> report
      </div>
      <input ref="fileInput" type="file" accept=".json,.csv" @change="onFileSelect" />
    </div>

    <p v-if="error" style="color: var(--color-error); margin-top: 1rem;">{{ error }}</p>
  </div>
</template>

<style scoped>
.crawl-form {
  width: 600px;
  max-width: 90vw;
}

.url-input-row {
  display: flex;
  gap: 0;
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.url-input {
  flex: 1;
  padding: 0.85rem 1rem;
  border: 2px solid var(--color-border);
  border-right: none;
  border-radius: var(--radius) 0 0 var(--radius);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s;
}

.url-input:focus {
  border-color: var(--color-primary);
}

.crawl-btn {
  padding: 0.85rem 1.5rem;
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-primary);
  border-radius: 0 var(--radius) var(--radius) 0;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.crawl-btn:hover:not(:disabled) {
  background: #3451d1;
}

.crawl-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.crawl-options {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  justify-content: center;
}

.crawl-options label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.crawl-options select,
.crawl-options input {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
}

.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  width: 500px;
  max-width: 90vw;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

/* Progress */
.crawl-progress {
  width: 600px;
  max-width: 90vw;
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 1.5rem;
  box-shadow: var(--shadow-md);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.progress-phase {
  font-weight: 500;
}

.progress-count {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.progress-bar-wrap {
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.2s;
}

.progress-log {
  font-size: 0.8rem;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.log-entry {
  display: flex;
  gap: 0.5rem;
  padding: 0.2rem 0;
  align-items: center;
  opacity: 0.9;
}

.log-entry:first-child {
  opacity: 1;
  font-weight: 500;
}

.log-status {
  min-width: 32px;
  font-weight: 600;
}

.log-status.green { color: var(--color-success); }
.log-status.yellow { color: var(--color-warning); }
.log-status.red { color: var(--color-error); }

.log-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}

.log-issues {
  min-width: 30px;
  text-align: right;
  font-weight: 600;
}

.log-time {
  min-width: 50px;
  text-align: right;
  color: var(--color-text-muted);
}
</style>
