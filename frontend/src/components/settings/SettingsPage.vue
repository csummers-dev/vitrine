<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <h1 class="settings-page__title">{{ title }}</h1>
      <p v-if="description" class="settings-page__description">
        {{ description }}
      </p>
    </header>
    <div class="settings-page__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<style scoped>
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 32px 80px;
}

.settings-page__header {
  margin-bottom: 24px;
}

.settings-page__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-ink-1, #18181b);
  margin: 0;
  line-height: 1.2;
}

.settings-page__description {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-ink-2, #52525b);
  line-height: 1.5;
}

.settings-page__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

@media (max-width: 540px) {
  .settings-page {
    padding: 20px 16px 60px;
  }
  .settings-page__title {
    font-size: 19px;
  }
}
</style>
