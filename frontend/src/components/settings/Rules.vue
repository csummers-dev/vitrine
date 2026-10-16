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
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.rules__row.is-deny {
  background: var(--status-danger-soft);
  border-color: var(--status-danger-ring);
}

/* ── Verdict chip (Allow / Deny toggle) ─────────────────────────────── */
.rules__verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-full);
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
  background: var(--status-success-soft);
  color: var(--status-success);
}

.rules__verdict.is-allow:hover {
  background: var(--status-success-soft);
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
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: 500;
  background: var(--color-elevated);
  border: 1px solid var(--color-line);
  color: var(--color-ink-2);
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.rules__mode.is-on {
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
  border-color: var(--color-accent-ring);
}

.rules__mode:hover {
  color: var(--color-ink-1);
}

.rules__mode.is-on:hover {
  color: var(--color-accent-strong);
}

/* ── Pattern input ──────────────────────────────────────────────────── */
.rules__input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-1);
  outline: none;
  transition:
    border-color 0.1s ease,
    box-shadow 0.1s ease;
}

.rules__input:focus {
  background: var(--color-surface);
  border-color: var(--color-accent);
  box-shadow: var(--focus-halo);
}

/* ── Delete icon button ─────────────────────────────────────────────── */
.rules__delete {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-ink-3);
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
  color: var(--color-ink-3);
  text-align: center;
  background: var(--color-canvas);
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-line-strong);
  background: transparent;
  color: var(--color-ink-2);
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
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  border-style: solid;
  color: var(--color-accent-ink);
}

.rules__add:focus-visible {
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 1px;
}
</style>
