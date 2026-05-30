<template>
  <div class="user-commands">
    <p class="user-commands__hint">
      {{ $t("settings.userCommandsHelp") }}
      <code>git svn hg</code>
    </p>
    <input
      class="fb-input fb-input--mono"
      type="text"
      v-model.trim="raw"
      placeholder="git svn hg"
    />
  </div>
</template>

<script>
export default {
  name: "commands",
  props: ["commands"],
  computed: {
    raw: {
      get() {
        return (this.commands || []).join(" ");
      },
      set(value) {
        if (value !== "") {
          this.$emit("update:commands", value.split(" "));
        } else {
          this.$emit("update:commands", []);
        }
      },
    },
  },
};
</script>

<style scoped>
.user-commands {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-commands__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-ink-2, #52525b);
}

.user-commands__hint code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-elevated, #f4f4f5);
  color: var(--color-ink-1, #18181b);
  border: 1px solid var(--color-line, #ececec);
}
</style>
