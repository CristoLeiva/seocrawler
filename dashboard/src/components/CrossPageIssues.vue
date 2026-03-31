<script setup lang="ts">
import { computed } from 'vue';
import { useCrawlStore } from '../stores/crawlData';
import { issueRecommendations } from '../data/issueRecommendations';

const store = useCrawlStore();

const issues = computed(() => {
  const data = store.data.value;
  if (!data?.crossPageIssues || data.crossPageIssues.length === 0) return [];
  // Sort: errors first, then warnings, then info
  const order = { error: 0, warning: 1, info: 2 };
  return [...data.crossPageIssues].sort(
    (a, b) => order[a.severity] - order[b.severity],
  );
});

function getFix(type: string): string {
  return issueRecommendations[type]?.fix || '';
}
</script>

<template>
  <div class="section" v-if="issues.length > 0">
    <div class="section-header">
      <h2>Cross-Page Issues ({{ issues.length }})</h2>
    </div>
    <div class="section-body" style="max-height: 400px; overflow-y: auto;">
      <div
        v-for="(issue, i) in issues"
        :key="i"
        class="detail-issue"
        :class="issue.severity"
        style="margin-bottom: 0.5rem;"
      >
        <div class="issue-type">
          <span class="badge" :class="issue.severity" style="margin-right: 6px;">{{ issue.severity }}</span>
          {{ issue.type }}
        </div>
        <div class="issue-message">{{ issue.message }}</div>
        <div class="issue-fix" v-if="getFix(issue.type)">Fix: {{ getFix(issue.type) }}</div>
      </div>
    </div>
  </div>
</template>
