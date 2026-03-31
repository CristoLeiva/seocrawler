<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCrawlStore } from '../stores/crawlData';
import { issueRecommendations } from '../data/issueRecommendations';

const store = useCrawlStore();
const filterText = ref('');

const maxCount = computed(() => {
  if (store.issuesSummary.value.length === 0) return 1;
  return store.issuesSummary.value[0].count;
});

const filteredIssues = computed(() => {
  if (!filterText.value) return store.issuesSummary.value;
  const q = filterText.value.toLowerCase();
  return store.issuesSummary.value.filter((i) => i.type.includes(q));
});

function selectIssue(type: string) {
  if (store.activeIssueFilter.value === type) {
    store.activeIssueFilter.value = null;
  } else {
    store.activeIssueFilter.value = type;
  }
}

function getPriority(type: string): string {
  return issueRecommendations[type]?.priority || 'MEDIUM';
}

function getFix(type: string): string {
  return issueRecommendations[type]?.fix || '';
}
</script>

<template>
  <div class="section">
    <div class="section-header">
      <h2>Issues Breakdown</h2>
      <input
        v-model="filterText"
        type="text"
        placeholder="Filter issues..."
        style="padding: 0.35rem 0.6rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 0.8rem; width: 160px;"
      />
    </div>
    <div class="section-body" style="max-height: 500px; overflow-y: auto;">
      <div v-if="filteredIssues.length === 0" style="color: var(--color-text-muted); padding: 1rem 0; text-align: center;">
        No issues found
      </div>
      <div
        v-for="issue in filteredIssues"
        :key="issue.type"
        class="issue-row"
        :class="{ active: store.activeIssueFilter.value === issue.type }"
        :style="store.activeIssueFilter.value === issue.type ? { background: 'var(--color-primary-light)', margin: '0 -1.25rem', padding: '0.5rem 1.25rem' } : {}"
        @click="selectIssue(issue.type)"
      >
        <span class="badge" :class="issue.severity">{{ issue.severity }}</span>
        <span class="issue-name" :title="getFix(issue.type)">
          {{ issue.type }}
          <span class="badge" :class="getPriority(issue.type).toLowerCase()" style="margin-left: 4px;">{{ getPriority(issue.type) }}</span>
        </span>
        <div class="issue-bar">
          <div
            class="issue-bar-fill"
            :class="issue.severity"
            :style="{ width: `${(issue.count / maxCount) * 100}%` }"
          />
        </div>
        <span class="issue-count">{{ issue.count }}</span>
      </div>
    </div>
  </div>
</template>
