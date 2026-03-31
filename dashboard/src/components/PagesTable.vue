<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCrawlStore } from '../stores/crawlData';
import type { PageResult } from '../types';

const store = useCrawlStore();
const pageSize = 50;
const currentPage = ref(1);

const emit = defineEmits<{ selectPage: [page: PageResult] }>();

const totalPages = computed(() => Math.ceil(store.filteredPages.value.length / pageSize));

const visiblePages = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return store.filteredPages.value.slice(start, start + pageSize);
});

function errCount(page: PageResult): number {
  return page.issues.filter((i) => i.severity === 'error').length;
}

function warnCount(page: PageResult): number {
  return page.issues.filter((i) => i.severity === 'warning').length;
}

function truncUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > 60) return path.substring(0, 57) + '...';
    return path || '/';
  } catch {
    return url;
  }
}

function sort(key: string) {
  store.toggleSort(key);
  currentPage.value = 1;
}

function sortIcon(key: string): string {
  if (store.sortKey.value !== key) return '';
  return store.sortDir.value === 'asc' ? ' ▲' : ' ▼';
}

function clearIssueFilter() {
  store.activeIssueFilter.value = null;
}

// Reset page when filters change
import { watch } from 'vue';
watch([() => store.searchQuery.value, () => store.severityFilter.value, () => store.activeIssueFilter.value], () => {
  currentPage.value = 1;
});
</script>

<template>
  <div class="section">
    <div class="section-header">
      <h2>
        Pages
        <span style="font-weight: 400; font-size: 0.85rem; color: var(--color-text-muted);">
          ({{ store.filteredPages.value.length }})
        </span>
      </h2>
      <div class="filters">
        <div v-if="store.activeIssueFilter.value" class="filter-tag">
          {{ store.activeIssueFilter.value }}
          <button @click="clearIssueFilter">&times;</button>
        </div>
        <input
          :value="store.searchQuery.value"
          @input="(e) => store.searchQuery.value = (e.target as HTMLInputElement).value"
          type="text"
          placeholder="Search URL, title, H1..."
        />
        <select
          :value="store.severityFilter.value"
          @change="(e) => store.severityFilter.value = (e.target as HTMLSelectElement).value as any"
        >
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>
      </div>
    </div>
    <div class="table-wrapper" style="max-height: 600px; overflow-y: auto;">
      <table>
        <thead>
          <tr>
            <th @click="sort('url')">URL<span class="sort-icon" :class="{ active: store.sortKey.value === 'url' }">{{ sortIcon('url') }}</span></th>
            <th @click="sort('status')">Status<span class="sort-icon" :class="{ active: store.sortKey.value === 'status' }">{{ sortIcon('status') }}</span></th>
            <th @click="sort('responseTime')">Time<span class="sort-icon" :class="{ active: store.sortKey.value === 'responseTime' }">{{ sortIcon('responseTime') }}</span></th>
            <th @click="sort('wordCount')">Words<span class="sort-icon" :class="{ active: store.sortKey.value === 'wordCount' }">{{ sortIcon('wordCount') }}</span></th>
            <th @click="sort('indexability')">Index<span class="sort-icon" :class="{ active: store.sortKey.value === 'indexability' }">{{ sortIcon('indexability') }}</span></th>
            <th @click="sort('issues')">Issues<span class="sort-icon" :class="{ active: store.sortKey.value === 'issues' }">{{ sortIcon('issues') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="page in visiblePages" :key="page.url" class="clickable" @click="emit('selectPage', page)">
            <td class="url-cell" :title="page.url">
              <a :href="page.url" target="_blank" @click.stop>{{ truncUrl(page.url) }}</a>
            </td>
            <td>
              <span :style="{ color: page.statusCode >= 400 ? 'var(--color-error)' : page.statusCode >= 300 ? 'var(--color-warning)' : 'var(--color-success)' }">
                {{ page.statusCode }}
              </span>
            </td>
            <td>{{ page.responseTime }}ms</td>
            <td>{{ page.wordCount }}</td>
            <td>
              <span class="badge" :class="page.indexability">
                {{ page.indexability === 'indexable' ? 'Yes' : 'No' }}
              </span>
            </td>
            <td>
              <span v-if="errCount(page) > 0" class="badge error" style="margin-right: 4px;">{{ errCount(page) }}E</span>
              <span v-if="warnCount(page) > 0" class="badge warning">{{ warnCount(page) }}W</span>
              <span v-if="page.issues.length === 0" class="badge indexable">OK</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination" v-if="totalPages > 1">
      <span>Page {{ currentPage }} of {{ totalPages }}</span>
      <div style="display: flex; gap: 0.5rem;">
        <button :disabled="currentPage <= 1" @click="currentPage--">Prev</button>
        <button :disabled="currentPage >= totalPages" @click="currentPage++">Next</button>
      </div>
    </div>
  </div>
</template>
