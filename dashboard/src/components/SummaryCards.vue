<script setup lang="ts">
import { computed } from 'vue';
import { useCrawlStore } from '../stores/crawlData';

const store = useCrawlStore();

const indexable = computed(() =>
  store.data.value!.pages.filter((p) => p.indexability === 'indexable').length,
);
const nonIndexable = computed(() =>
  store.data.value!.pages.filter((p) => p.indexability === 'non-indexable').length,
);
const avgResponseTime = computed(() => {
  const pages = store.data.value!.pages.filter((p) => p.statusCode > 0);
  if (pages.length === 0) return 0;
  return Math.round(pages.reduce((acc, p) => acc + p.responseTime, 0) / pages.length);
});
</script>

<template>
  <div class="cards-grid">
    <div class="card">
      <div class="value">{{ store.data.value!.crawledUrls }}</div>
      <div class="label">Pages Crawled</div>
    </div>
    <div class="card">
      <div class="health-ring">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-border)" stroke-width="5" />
          <circle
            cx="26" cy="26" r="22" fill="none"
            :stroke="store.healthScore.value >= 90 ? 'var(--color-success)' : store.healthScore.value >= 70 ? 'var(--color-warning)' : 'var(--color-error)'"
            stroke-width="5"
            :stroke-dasharray="`${store.healthScore.value * 1.382} 138.2`"
            stroke-linecap="round"
          />
        </svg>
        <div>
          <div class="score" :style="{ color: store.healthScore.value >= 90 ? 'var(--color-success)' : store.healthScore.value >= 70 ? 'var(--color-warning)' : 'var(--color-error)' }">
            {{ store.healthScore.value }}%
          </div>
          <div class="score-label">Health</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="value error">{{ store.data.value!.errors }}</div>
      <div class="label">Errors</div>
    </div>
    <div class="card">
      <div class="value warning">{{ store.data.value!.warnings }}</div>
      <div class="label">Warnings</div>
    </div>
    <div class="card">
      <div class="value info">{{ store.data.value!.infos }}</div>
      <div class="label">Info</div>
    </div>
    <div class="card">
      <div class="value success">{{ indexable }}</div>
      <div class="label">Indexable</div>
    </div>
    <div class="card" v-if="nonIndexable > 0">
      <div class="value error">{{ nonIndexable }}</div>
      <div class="label">Non-Indexable</div>
    </div>
    <div class="card">
      <div class="value">{{ avgResponseTime }}ms</div>
      <div class="label">Avg Response</div>
    </div>
    <div class="card">
      <div class="value">{{ (store.data.value!.duration / 1000).toFixed(1) }}s</div>
      <div class="label">Crawl Duration</div>
    </div>
  </div>
</template>
