<template>
  <!-- Development-only component gallery (Phase 6, 2.2). Not in production
       builds: the route exists only when import.meta.env.DEV. -->
  <main class="gallery" data-testid="ui-gallery">
    <UiPageHeader
      eyebrow="Development"
      title="Components"
      meta="Every shared component in its states."
    >
      <template #actions>
        <UiSegmented
          v-model="theme"
          :options="themeOptions"
          aria-label="Theme"
          size="sm"
        />
      </template>
    </UiPageHeader>

    <div class="gallery__grid">
      <UiPanel title="Buttons" data-gallery="buttons">
        <div class="row">
          <UiButton variant="primary" icon="upload">Upload</UiButton>
          <UiButton>Secondary</UiButton>
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="danger" icon="trash-2">Delete</UiButton>
        </div>
        <div class="row">
          <UiButton variant="primary" size="sm">Small</UiButton>
          <UiButton size="sm" icon="plus">Small icon</UiButton>
          <UiButton variant="primary" loading>Saving</UiButton>
          <UiButton disabled disabled-reason="Nothing to save"
            >Disabled</UiButton
          >
        </div>
        <div class="row">
          <UiIconButton icon="search" label="Search" />
          <UiIconButton icon="list" label="List view" :pressed="true" />
          <UiIconButton icon="settings" label="Settings" variant="secondary" />
          <UiIconButton icon="plus" label="Add" variant="primary" />
          <UiIconButton icon="x" label="Close" size="sm" />
          <UiIconButton icon="trash-2" label="Delete" disabled />
        </div>
      </UiPanel>

      <UiPanel title="Text fields" data-gallery="fields">
        <div class="stack">
          <UiTextField
            v-model="name"
            label="Name"
            hint="Shown to people you share with."
          />
          <UiTextField
            v-model="search"
            aria-label="Search"
            icon="search"
            placeholder="Search"
            clearable
          />
          <UiTextField v-model="path" label="Folder" mono />
          <UiTextField
            v-model="bad"
            label="Password"
            type="password"
            error="At least 12 characters."
          />
          <UiTextField v-model="name" label="Disabled" disabled />
        </div>
      </UiPanel>

      <UiPanel title="Choices" data-gallery="choices">
        <div class="stack">
          <UiSelect
            v-model="size"
            label="Smallest file"
            :options="sizeOptions"
          />
          <div class="row">
            <UiCheckbox v-model="checkA" label="Checked" />
            <UiCheckbox v-model="checkB" label="Unchecked" />
            <UiCheckbox v-model="checkB" label="Some" indeterminate />
            <UiCheckbox v-model="checkA" label="Disabled" disabled />
          </div>
          <div class="row" role="radiogroup" aria-label="Sort">
            <UiRadio v-model="sort" value="name" name="sort" label="Name" />
            <UiRadio v-model="sort" value="size" name="sort" label="Size" />
            <UiRadio
              v-model="sort"
              value="date"
              name="sort"
              label="Date"
              disabled
            />
          </div>
          <div class="row">
            <UiToggle v-model="on" label="On" />
            <UiToggle v-model="off" label="Off" />
            <UiToggle v-model="on" label="Disabled" disabled />
          </div>
          <div class="row">
            <UiSegmented
              v-model="view"
              :options="viewOptions"
              aria-label="View"
            />
            <UiSegmented
              v-model="view"
              :options="viewOptions"
              aria-label="View (icons)"
              icon-only
            />
          </div>
        </div>
      </UiPanel>

      <UiPanel title="Chips, tags and badges" data-gallery="chips">
        <div class="row">
          <UiChip :pressed="true" :count="12">All</UiChip>
          <UiChip :count="3" icon="image">Images</UiChip>
          <UiChip>Documents</UiChip>
          <UiChip disabled>Disabled</UiChip>
        </div>
        <div class="row">
          <TagChip v-for="t in tags" :key="t.id" :tag="t" />
          <TagChip :tag="tags[0]" removable />
        </div>
        <div class="row">
          <UiBadge :count="8" />
          <UiBadge :count="1200" />
          <UiBadge :count="3" tone="accent" />
          <UiBadge label="Failed" tone="danger" />
          <UiBadge label="Done" tone="success" />
          <UiBadge label="Paused" tone="warning" />
        </div>
      </UiPanel>

      <UiPanel title="Progress and loading" data-gallery="progress">
        <div class="stack">
          <UiProgress :value="62" label="Upload" />
          <UiProgress :value="100" label="Done" tone="success" />
          <UiProgress label="Working" />
          <div class="row">
            <UiProgress variant="ring" :value="25" label="Quarter" :size="24" />
            <UiProgress
              variant="ring"
              :value="75"
              label="Three quarters"
              :size="24"
              tone="success"
            />
            <UiProgress variant="ring" label="Loading" :size="24" />
          </div>
          <Skeleton shape="text" width="60%" />
          <Skeleton shape="row" />
          <div class="row">
            <Skeleton shape="tile" width="72px" />
            <Skeleton shape="circle" />
          </div>
        </div>
      </UiPanel>

      <UiPanel title="Empty state" data-gallery="empty" flush>
        <EmptyState
          icon="trash-2"
          title="Trash is empty"
          hint="Deleted files land here."
        />
        <template #footer>
          <UiButton size="sm">Cancel</UiButton>
          <UiButton size="sm" variant="primary">Save</UiButton>
        </template>
      </UiPanel>

      <UiPanel title="Menu" tone="sunken" data-gallery="menu">
        <div class="menu-host">
          <UiButton icon="ellipsis" @click="openMenu">Open menu</UiButton>
        </div>
        <ContextMenu
          :show="menuOpen"
          :pos="menuPos"
          :items="menuItems"
          @hide="menuOpen = false"
        />
      </UiPanel>

      <UiPanel title="Dialog and toasts" data-gallery="dialog">
        <div class="row">
          <UiButton @click="dialogOpen = true">Open dialog</UiButton>
          <UiButton variant="ghost" @click="toast('success')"
            >Success toast</UiButton
          >
          <UiButton variant="ghost" @click="toast('error')"
            >Error toast</UiButton
          >
        </div>
      </UiPanel>
    </div>

    <BaseModal v-if="dialogOpen" @closed="dialogOpen = false">
      <UiPanel
        title="Delete 3 items?"
        description="They move to the trash; you can restore them for 30 days."
        class="gallery__dialog"
      >
        <template #footer>
          <UiButton @click="dialogOpen = false">Cancel</UiButton>
          <UiButton variant="danger" data-autofocus @click="dialogOpen = false"
            >Move to trash</UiButton
          >
        </template>
      </UiPanel>
    </BaseModal>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import UiButton from "@/components/ui/UiButton.vue";
import UiIconButton from "@/components/ui/UiIconButton.vue";
import UiTextField from "@/components/ui/UiTextField.vue";
import UiSelect from "@/components/ui/UiSelect.vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import UiRadio from "@/components/ui/UiRadio.vue";
import UiToggle from "@/components/ui/UiToggle.vue";
import UiSegmented from "@/components/ui/UiSegmented.vue";
import UiChip from "@/components/ui/UiChip.vue";
import UiBadge from "@/components/ui/UiBadge.vue";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
import UiPanel from "@/components/ui/UiPanel.vue";
import UiProgress from "@/components/ui/UiProgress.vue";
import Skeleton from "@/components/Skeleton.vue";
import EmptyState from "@/components/EmptyState.vue";
import TagChip from "@/components/TagChip.vue";
import ContextMenu, { type MenuItem } from "@/components/ContextMenu.vue";
import BaseModal from "@/components/prompts/BaseModal.vue";
import { setTheme } from "@/utils/theme";

const route = useRoute();

const theme = ref<"light" | "dark">(
  document.documentElement.classList.contains("dark") ? "dark" : "light"
);
const themeOptions = [
  { value: "light" as const, label: "Light", icon: "sun" },
  { value: "dark" as const, label: "Dark", icon: "moon" },
];
watch(theme, (t) => setTheme(t));

const name = ref("Holiday photos");
const search = ref("lisbon");
const path = ref("/Movies/4K Remux");
const bad = ref("short");
const size = ref(1024);
const sizeOptions = [
  { value: 0, label: "Any size" },
  { value: 1024, label: "1 KB" },
  { value: 1048576, label: "1 MB" },
];
const checkA = ref(true);
const checkB = ref(false);
const sort = ref("name");
const on = ref(true);
const off = ref(false);
const view = ref("list");
const viewOptions = [
  { value: "list", label: "List", icon: "list" },
  { value: "mosaic", label: "Icons", icon: "layout-grid" },
  { value: "gallery", label: "Gallery", icon: "image" },
];
const tags: Tag[] = [
  { id: 1, name: "family", color: "green", createdAt: "" },
  { id: 2, name: "travel", color: "amber", createdAt: "" },
  { id: 3, name: "work", color: "blue", createdAt: "" },
];

const menuOpen = ref(false);
const menuPos = ref({ x: 0, y: 0 });
const menuItems: MenuItem[] = [
  { type: "header", label: "Trip to Lisbon.mkv" },
  { label: "Open", icon: "external-link" },
  { label: "Rename", icon: "pencil", kbd: "F2" },
  { label: "Copy", icon: "copy", kbd: "⌘C" },
  { type: "separator" },
  { label: "Delete", icon: "trash-2", destructive: true, kbd: "Del" },
];
const openMenu = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menuPos.value = { x: r.left, y: r.bottom + 4 };
  menuOpen.value = true;
};

const dialogOpen = ref(false);
const toaster = useToast();
const toast = (kind: "success" | "error") =>
  kind === "success"
    ? toaster.success("Saved")
    : toaster.error("Couldn't save");

// ?state=dialog|menu opens one for screenshots.
onMounted(() => {
  if (route.query.state === "dialog") dialogOpen.value = true;
  if (route.query.state === "menu") {
    menuPos.value = { x: 40, y: 120 };
    menuOpen.value = true;
  }
});
</script>

<style scoped>
.gallery {
  min-height: 100vh;
  background: var(--color-surface);
  color: var(--color-ink-1);
  font-family: var(--font-sans);
}
.gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-4);
  padding: 0 var(--space-5) var(--space-8);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.row + .row {
  margin-top: var(--space-3);
}
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.menu-host {
  min-height: 40px;
}
.gallery__dialog {
  width: min(440px, 100%);
  box-shadow: var(--shadow-2);
}
@media (max-width: 767px) {
  .gallery__grid {
    padding: 0 var(--space-3) var(--space-6);
    grid-template-columns: 1fr;
  }
}
</style>
