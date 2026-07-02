<template>
  <div class="rules">
    <ul v-if="rules.length > 0" class="rules__list">
      <li
        v-for="(rule, index) in rules"
        :key="index"
        class="rules__row"
        :class="{ 'is-allow': rule.allow, 'is-deny': !rule.allow }"
      >
        <!-- Allow / Deny chip toggle -->
        <button
          type="button"
          class="rules__verdict"
          :class="rule.allow ? 'is-allow' : 'is-deny'"
          @click.prevent="rule.allow = !rule.allow"
          :title="
            rule.allow ? 'Allow — click to deny' : 'Deny — click to allow'
          "
        >
          <Icon :name="rule.allow ? 'check' : 'x'" :size="11" />
          {{ rule.allow ? "Allow" : "Deny" }}
        </button>

        <!-- Regex toggle chip -->
        <button
          type="button"
          class="rules__mode"
          :class="{ 'is-on': rule.regex }"
          @click.prevent="rule.regex = !rule.regex"
          :title="rule.regex ? 'Regex pattern' : 'Literal path'"
        >
          <Icon :name="rule.regex ? 'regex' : 'folder'" :size="11" />
          {{ rule.regex ? "Regex" : "Path" }}
        </button>

        <!-- Pattern input -->
        <input
          v-if="rule.regex"
          v-model="rule.regexp.raw"
          type="text"
          class="rules__input"
          :placeholder="$t('settings.insertRegex')"
          @keypress.enter.prevent
        />
        <input
          v-else
          v-model="rule.path"
          type="text"
          class="rules__input"
          :placeholder="$t('settings.insertPath')"
          @keypress.enter.prevent
        />

        <!-- Delete -->
        <button
          type="button"
          class="rules__delete"
          :title="$t('buttons.delete')"
          aria-label="Delete rule"
          @click="remove($event, index)"
        >
          <Icon name="trash-2" :size="12" />
        </button>
      </li>
    </ul>

    <p v-else class="rules__empty">
      No rules yet. Add one to allow or deny access to specific paths or regex
      patterns.
    </p>

    <!-- Add-new button row -->
    <div class="rules__add-row">
      <button type="button" class="rules__add" @click="create">
        <Icon name="plus" :size="13" />
        <span>{{ $t("buttons.new") }} rule</span>
      </button>
    </div>
  </div>
</template>

<script>
import Icon from "@/components/Icon.vue";

export default {
  name: "rules-textarea",
  components: { Icon },
  props: ["rules"],
  methods: {
    remove(event, index) {
      event.preventDefault();
      const rules = [...this.rules];
      rules.splice(index, 1);
      this.$emit("update:rules", [...rules]);
    },
    create(event) {
      event.preventDefault();
      this.$emit("update:rules", [
        ...this.rules,
        {
          allow: true,
          path: "",
          regex: false,
          regexp: {
            raw: "",
          },
        },
      ]);
    },
  },
};
</script>

<style scoped>
.rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── List of rules ──────────────────────────────────────────────────── */
.rules__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rules__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 8px;
  background: var(--color-surface, #fff);
}

.rules__row.is-deny {
  background: #fef9f9;
  border-color: #fee2e2;
}

/* ── Verdict chip (Allow / Deny toggle) ─────────────────────────────── */
.rules__verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.rules__verdict.is-allow {
  background: rgba(4, 120, 87, 0.1);
  color: var(--status-success);
}

.rules__verdict.is-allow:hover {
  background: rgba(4, 120, 87, 0.18);
}

.rules__verdict.is-deny {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}

.rules__verdict.is-deny:hover {
  background: var(--status-danger-soft);
}

/* ── Mode chip (Path / Regex toggle) ────────────────────────────────── */
.rules__mode {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  background: var(--color-elevated, #f4f4f5);
  border: 1px solid var(--color-line, #ececec);
  color: var(--color-ink-2, #52525b);
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.rules__mode.is-on {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.1));
  color: var(--color-accent, #6e72d9);
  border-color: rgba(110, 114, 217, 0.25);
}

.rules__mode:hover {
  color: var(--color-ink-1, #18181b);
}

.rules__mode.is-on:hover {
  color: var(--color-accent-strong, #575cc7);
}

/* ── Pattern input ──────────────────────────────────────────────────── */
.rules__input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-line, #ececec);
  border-radius: 6px;
  background: var(--color-canvas, #fafaf9);
  font: inherit;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--color-ink-1, #18181b);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.rules__input:focus {
  background: var(--color-surface, #fff);
  border-color: var(--color-accent, #6e72d9);
  box-shadow: 0 0 0 3px var(--color-accent-ring, rgba(110, 114, 217, 0.3));
}

/* ── Delete icon button ─────────────────────────────────────────────── */
.rules__delete {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-ink-3, #a1a1aa);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.1s ease,
    color 0.1s ease,
    border-color 0.1s ease;
}

.rules__delete:hover {
  background: var(--status-danger-soft);
  color: var(--status-danger);
  border-color: var(--status-danger-ring);
}

/* ── Empty state ────────────────────────────────────────────────────── */
.rules__empty {
  margin: 4px 0 0;
  padding: 14px;
  font-size: 12.5px;
  color: var(--color-ink-3, #a1a1aa);
  text-align: center;
  background: var(--color-canvas, #fafaf9);
  border: 1px dashed var(--color-line, #ececec);
  border-radius: 8px;
  line-height: 1.4;
}

/* ── Add-new button ─────────────────────────────────────────────────── */
.rules__add-row {
  display: flex;
}

.rules__add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px dashed var(--color-line-strong, #d4d4d8);
  background: transparent;
  color: var(--color-ink-2, #52525b);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

.rules__add:hover {
  background: var(--color-accent-soft, rgba(110, 114, 217, 0.08));
  border-color: var(--color-accent, #6e72d9);
  border-style: solid;
  color: var(--color-accent, #6e72d9);
}

.rules__add:focus-visible {
  outline: 2px solid var(--color-accent-ring, rgba(110, 114, 217, 0.3));
  outline-offset: 1px;
}
</style>
