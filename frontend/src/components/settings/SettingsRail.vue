<template>
  <aside
    class="settings-rail w-full flex flex-col overflow-y-auto bg-canvas"
    :class="{ 'border-r border-line': !borderless }"
  >
    <div class="px-4 pt-5 pb-2">
      <div
        class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
      >
        User
      </div>
    </div>
    <nav class="px-2 space-y-0.5 text-[13px]">
      <router-link
        v-for="section in userSections"
        :key="section.to"
        :to="section.to"
        v-slot="{ isActive, navigate }"
        custom
      >
        <button
          type="button"
          :class="[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left',
            isActive
              ? 'bg-selected text-accent font-medium'
              : 'hover:bg-hover text-ink-2',
          ]"
          @click="(e) => onNavClick(e, navigate)"
        >
          <Icon :name="section.icon" :size="14" />
          <span class="flex-1">{{ section.label }}</span>
        </button>
      </router-link>
    </nav>

    <template v-if="user?.perm.admin">
      <div class="px-4 pt-5 pb-2">
        <div
          class="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.06em]"
        >
          Administration
        </div>
      </div>
      <nav class="px-2 space-y-0.5 text-[13px]">
        <router-link
          v-for="section in adminSections"
          :key="section.to"
          :to="section.to"
          v-slot="{ isActive, navigate }"
          custom
        >
          <button
            type="button"
            :class="[
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-left',
              isActive ||
              (section.matchPrefix &&
                $route.path.startsWith(section.matchPrefix))
                ? 'bg-selected text-accent font-medium'
                : 'hover:bg-hover text-ink-2',
            ]"
            @click="(e) => onNavClick(e, navigate)"
          >
            <Icon :name="section.icon" :size="14" />
            <span class="flex-1">{{ section.label }}</span>
          </button>
        </router-link>
      </nav>
    </template>

    <div class="flex-1"></div>

    <!-- Back-to-files chip at the bottom of the rail -->
    <div class="p-3 border-t border-line">
      <router-link
        to="/files/"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover text-ink-2 text-[12.5px] transition"
        @click="onItemClicked"
      >
        <Icon name="arrow-left" :size="13" />
        <span>Back to files</span>
      </router-link>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import Icon from "@/components/Icon.vue";

const { t } = useI18n();
const authStore = useAuthStore();

const props = withDefaults(
  defineProps<{
    /** When rendered inside a drawer, drop the right border (the drawer
     *  panel already has its own divider). */
    borderless?: boolean;
  }>(),
  { borderless: false }
);
void props;

const emit = defineEmits<{
  /** Fires when the user clicks a nav item. The parent uses this to close
   *  the mobile drawer after picking a destination. */
  (e: "itemClicked"): void;
}>();

const user = computed(() => authStore.user);

interface NavSection {
  to: string;
  label: string;
  icon: string;
  /** When matched as a prefix, the link is highlighted (for nested routes). */
  matchPrefix?: string;
}

const userSections = computed<NavSection[]>(() => {
  const list: NavSection[] = [
    {
      to: "/settings/profile",
      label: t("settings.profileSettings"),
      icon: "user",
    },
  ];
  if (user.value?.perm.share) {
    list.push({
      to: "/settings/shares",
      label: t("settings.shareManagement"),
      icon: "share-2",
    });
  }
  list.push({
    to: "/settings/sessions",
    label: "Sessions",
    icon: "monitor-smartphone",
  });
  return list;
});

const adminSections = computed<NavSection[]>(() => [
  {
    to: "/settings/global",
    label: t("settings.globalSettings"),
    icon: "settings-2",
  },
  {
    to: "/settings/users",
    label: t("settings.userManagement"),
    icon: "users",
    matchPrefix: "/settings/users",
  },
  {
    to: "/settings/audit",
    label: "Audit log",
    icon: "scroll-text",
  },
  {
    to: "/settings/webhooks",
    label: "Webhooks",
    icon: "webhook",
  },
]);

const onNavClick = (e: MouseEvent, navigate: (e: MouseEvent) => void) => {
  navigate(e);
  emit("itemClicked");
};

const onItemClicked = () => emit("itemClicked");
</script>
