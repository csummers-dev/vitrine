<template>
  <div class="confirm-prompt" @click.stop>
    <div class="confirm-prompt__body">
      <div class="confirm-prompt__icon is-danger">
        <Icon name="trash-2" :size="18" :stroke-width="1.6" />
      </div>
      <div class="confirm-prompt__text">
        <h2 class="confirm-prompt__title">{{ title }}</h2>
        <p class="confirm-prompt__message">
          It can be restored from the Trash later.
        </p>
      </div>
    </div>
    <div class="confirm-prompt__actions">
      <UiButton size="sm" data-autofocus @click="closeHovers">{{
        $t("buttons.cancel")
      }}</UiButton>
      <UiButton id="focus-prompt" size="sm" variant="danger" @click="submit">{{
        action
      }}</UiButton>
    </div>
  </div>
</template>

<script>
import Icon from "@/components/Icon.vue";
import UiButton from "@/components/ui/UiButton.vue";
import { mapActions, mapState, mapWritableState } from "pinia";
import { files as api } from "@/api";
import buttons from "@/utils/buttons";
import { useFileStore } from "@/stores/file";
import { useLayoutStore } from "@/stores/layout";

export default {
  name: "delete",
  components: { Icon, UiButton },
  inject: ["$showError"],
  computed: {
    ...mapState(useFileStore, [
      "isListing",
      "selectedCount",
      "req",
      "selected",
    ]),
    ...mapState(useLayoutStore, ["currentPrompt"]),
    // Named for what will happen (Phase 6, 6.2).
    count() {
      return !this.isListing ? 1 : this.selectedCount;
    },
    title() {
      return this.count === 1
        ? "Move this to the Trash?"
        : `Move ${this.count} items to the Trash?`;
    },
    action() {
      return this.count === 1
        ? "Move to the Trash"
        : `Move ${this.count} items to the Trash`;
    },
    ...mapWritableState(useFileStore, ["reload", "preselect"]),
  },
  methods: {
    ...mapActions(useLayoutStore, ["closeHovers"]),
    submit: async function () {
      buttons.loading("delete");

      try {
        if (!this.isListing) {
          await api.remove(this.$route.path);
          buttons.success("delete");

          this.currentPrompt?.confirm();
          this.closeHovers();
          return;
        }

        this.closeHovers();

        if (this.selectedCount === 0) {
          return;
        }

        const promises = [];
        for (const index of this.selected) {
          promises.push(api.remove(this.req.items[index].url));
        }

        await Promise.all(promises);
        buttons.success("delete");

        const nearbyItem =
          this.req.items[Math.max(0, Math.min(this.selected) - 1)];

        this.preselect = nearbyItem?.path;

        this.reload = true;
      } catch (e) {
        buttons.done("delete");
        this.$showError(e);
        if (this.isListing) this.reload = true;
      }
    },
  },
};
</script>
