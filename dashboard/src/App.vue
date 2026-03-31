<script setup lang="ts">
import { createCrawlStore, provideCrawlStore } from './stores/crawlData';
import type { CrawlSummary } from './types';
import FileLoader from './components/FileLoader.vue';
import SummaryCards from './components/SummaryCards.vue';
import IssuesBreakdown from './components/IssuesBreakdown.vue';
import PagesTable from './components/PagesTable.vue';
import PageDetail from './components/PageDetail.vue';
import CrossPageIssues from './components/CrossPageIssues.vue';
import type { PageResult } from './types';

const store = createCrawlStore();
provideCrawlStore(store);

function onLoaded(data: CrawlSummary) {
  store.loadData(data);
}

function onSelectPage(page: PageResult) {
  store.selectedPage.value = page;
}

function reload() {
  store.data.value = null;
}
</script>

<template>
  <div class="app">
    <FileLoader v-if="!store.data.value" @loaded="onLoaded" />

    <template v-else>
      <div class="app-header">
        <h1>SEO Crawler Dashboard</h1>
        <button class="load-btn" @click="reload">Load another report</button>
      </div>

      <SummaryCards />

      <CrossPageIssues />

      <div class="dashboard-grid">
        <IssuesBreakdown />
        <PagesTable @select-page="onSelectPage" />
      </div>

      <PageDetail />
    </template>
  </div>
</template>
