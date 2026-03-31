<script setup lang="ts">
import { useCrawlStore } from '../stores/crawlData';
import { issueRecommendations } from '../data/issueRecommendations';
import type { SeoIssue } from '../types';

const store = useCrawlStore();

function close() {
  store.selectedPage.value = null;
}

function getFix(type: string): string {
  return issueRecommendations[type]?.fix || '';
}

function groupedIssues(): { severity: string; issues: SeoIssue[] }[] {
  const page = store.selectedPage.value;
  if (!page) return [];
  const groups: Record<string, SeoIssue[]> = { error: [], warning: [], info: [] };
  for (const issue of page.issues) {
    groups[issue.severity].push(issue);
  }
  return Object.entries(groups)
    .filter(([, issues]) => issues.length > 0)
    .map(([severity, issues]) => ({ severity, issues }));
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

import { onMounted, onUnmounted } from 'vue';
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <template v-if="store.selectedPage.value">
    <div class="detail-overlay" @click="close" />
    <div class="detail-panel">
      <button class="close-btn" @click="close">&times;</button>

      <h2>{{ store.selectedPage.value.url }}</h2>

      <!-- Status bar -->
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap;">
        <span class="badge" :class="store.selectedPage.value.statusCode >= 400 ? 'error' : 'indexable'">
          HTTP {{ store.selectedPage.value.statusCode }}
        </span>
        <span class="badge" :class="store.selectedPage.value.indexability">
          {{ store.selectedPage.value.indexability }}
        </span>
        <span v-if="store.selectedPage.value.indexabilityReason" class="badge" style="background: var(--color-bg);">
          {{ store.selectedPage.value.indexabilityReason }}
        </span>
        <span class="badge" style="background: var(--color-bg);">
          {{ store.selectedPage.value.responseTime }}ms
        </span>
        <span class="badge" style="background: var(--color-bg);">
          {{ (store.selectedPage.value.contentLength / 1024).toFixed(0) }}KB
        </span>
        <span class="badge" style="background: var(--color-bg);">
          {{ store.selectedPage.value.wordCount }} words
        </span>
      </div>

      <!-- SEO Metadata -->
      <div class="detail-section">
        <h3>SEO Metadata</h3>
        <dl class="detail-meta">
          <dt>Title</dt>
          <dd>
            {{ store.selectedPage.value.title || '(missing)' }}
            <span v-if="store.selectedPage.value.title" style="color: var(--color-text-muted); font-size: 0.8rem;">
              ({{ store.selectedPage.value.title.length }} chars)
            </span>
          </dd>
          <dt>Description</dt>
          <dd>
            {{ store.selectedPage.value.metaDescription || '(missing)' }}
            <span v-if="store.selectedPage.value.metaDescription" style="color: var(--color-text-muted); font-size: 0.8rem;">
              ({{ store.selectedPage.value.metaDescription.length }} chars)
            </span>
          </dd>
          <dt>H1</dt>
          <dd>{{ store.selectedPage.value.h1s.length > 0 ? store.selectedPage.value.h1s.join(' | ') : '(missing)' }}</dd>
          <dt>Canonical</dt>
          <dd>{{ store.selectedPage.value.canonical || '(missing)' }}</dd>
          <dt>Text/HTML Ratio</dt>
          <dd>{{ store.selectedPage.value.contentToHtmlRatio.toFixed(1) }}%</dd>
        </dl>
      </div>

      <!-- Redirect Chain -->
      <div class="detail-section" v-if="store.selectedPage.value.redirectChain.length > 0">
        <h3>Redirect Chain</h3>
        <div style="font-size: 0.85rem;">
          <span v-for="(hop, i) in store.selectedPage.value.redirectChain" :key="i">
            {{ hop }} &rarr;<br />
          </span>
          <strong>{{ store.selectedPage.value.finalUrl }}</strong>
        </div>
      </div>

      <!-- Issues -->
      <div class="detail-section">
        <h3>Issues ({{ store.selectedPage.value.issues.length }})</h3>
        <div v-if="store.selectedPage.value.issues.length === 0" style="color: var(--color-success); font-size: 0.85rem;">
          No issues found
        </div>
        <template v-for="group in groupedIssues()" :key="group.severity">
          <div v-for="issue in group.issues" :key="issue.type + issue.message" class="detail-issue" :class="issue.severity">
            <div class="issue-type">
              <span class="badge" :class="issue.severity" style="margin-right: 4px;">{{ issue.severity }}</span>
              {{ issue.type }}
            </div>
            <div class="issue-message">{{ issue.message }}</div>
            <div class="issue-fix" v-if="getFix(issue.type)">Fix: {{ getFix(issue.type) }}</div>
          </div>
        </template>
      </div>

      <!-- Internal Links -->
      <div class="detail-section" v-if="store.selectedPage.value.internalLinkDetails && store.selectedPage.value.internalLinkDetails.length > 0">
        <h3>Internal Links ({{ store.selectedPage.value.internalLinkDetails.length }})</h3>
        <div style="max-height: 250px; overflow-y: auto; font-size: 0.8rem;">
          <table style="font-size: 0.8rem;">
            <thead>
              <tr>
                <th style="font-size: 0.7rem;">URL</th>
                <th style="font-size: 0.7rem;">Anchor Text</th>
                <th style="font-size: 0.7rem;">Nofollow</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(link, i) in store.selectedPage.value.internalLinkDetails.slice(0, 50)" :key="i">
                <td class="url-cell" style="max-width: 200px;" :title="link.href">{{ link.href }}</td>
                <td>{{ link.anchorText || '(empty)' }}</td>
                <td>
                  <span v-if="link.isNofollow" class="badge error">nofollow</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="store.selectedPage.value.internalLinkDetails.length > 50" style="color: var(--color-text-muted); padding: 0.5rem 0;">
            ... and {{ store.selectedPage.value.internalLinkDetails.length - 50 }} more
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
