<template>
  <base-modal v-if="modal != null" :prompt="currentPromptName" @closed="close">
    <keep-alive>
      <component :is="modal" />
    </keep-alive>
  </base-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLayoutStore } from "@/stores/layout";

import BaseModal from "./BaseModal.vue";
import Info from "./Info.vue";
import Delete from "./Delete.vue";
import DeleteUser from "./DeleteUser.vue";
import Download from "./Download.vue";
import Replace from "./Replace.vue";
import ShareDelete from "./ShareDelete.vue";
import Upload from "./Upload.vue";
import DiscardEditorChanges from "./DiscardEditorChanges.vue";
import ResolveConflict from "./ResolveConflict.vue";
import CurrentPassword from "./CurrentPassword.vue";

const layoutStore = useLayoutStore();

const { currentPromptName } = storeToRefs(layoutStore);

const components = new Map<string, any>([
  ["info", Info],
  // help → migrated to the global ShortcutsOverlay (Stage 11g). Triggered
  // via the `?` shortcut, F1 from Files.vue, or useShortcutsOverlay().open().
  ["delete", Delete],
  // rename → handled inline on the ListingItem row (Stage 8)
  // move / copy / share → handled by slide-over panels (Stage 8)
  // newFile / newDir → handled inline in FileListing (Stage 8)
  ["download", Download],
  ["replace", Replace],
  ["upload", Upload],
  ["share-delete", ShareDelete],
  ["deleteUser", DeleteUser],
  ["discardEditorChanges", DiscardEditorChanges],
  ["resolve-conflict", ResolveConflict],
  ["current-password", CurrentPassword],
]);

const modal = computed(() => {
  const modal = components.get(currentPromptName.value!);
  if (!modal) null;

  return modal;
});

const close = () => {
  if (!layoutStore.currentPrompt) return;
  layoutStore.closeHovers();
};
</script>
