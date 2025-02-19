<template>
  <q-layout view="hHh LpR fFf">
    <q-header height-hint="98">
      <q-toolbar class="main-toolbar">
        <q-toolbar-title>
          <q-avatar square class="cursor-pointer q-mr-sm" @click="goHome()">
            <img src="../assets/images/auto-multiple-choice.svg" />
          </q-avatar>
          <span class="cursor-pointer" @click="goHome()">Grade Manager AMCUI</span>
          <span v-if="API.project"> | {{ API.project }}</span>
        </q-toolbar-title>

        <q-btn
          flat
          type="a"
          href="https://bfritscher.github.io/amcui-grademanager/"
          target="_blank"
        >
          docs
        </q-btn>

        <q-btn v-if="store.user?.username" flat :label="store.user.username">
          <q-menu fit>
            <q-list style="min-width: 140px">
              <q-item v-close-popup clickable @click="API.showProgressDialog()">
                <q-item-section>Task progress</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :to="{ name: 'Profile' }">
                <q-item-section>Edit profile</q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable @click="store.logout()">
                <q-item-section>Logout</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
      <q-toolbar
        v-if="
          ['Edit', 'Scan', 'ScanPreview', 'Grade', 'History', 'Options'].includes(
            String(route.name)
          )
        "
        class="bg-white text-primary"
        style="min-height: unset"
      >
        <q-tabs
          align="left"
          class="text-grey-8"
          active-color="primary"
          indicator-color="primary"
          shrink
          stretch
          dense
        >
          <q-route-tab :to="{ name: 'Edit', params: { project: API.project } }" label="Edit">
            <awareness-indicator id="Edit" class="awareness-tab-indicator" floating />
          </q-route-tab>
          <q-route-tab
            :to="{ name: 'Scan', params: { project: API.project } }"
            :disable="!API.options.status.printed"
            label="Scan"
          >
            <awareness-indicator id="Scan" class="awareness-tab-indicator" floating />
          </q-route-tab>
          <q-route-tab :to="{ name: 'Grade', params: { project: API.project } }" label="Grade">
            <awareness-indicator id="Grade" class="awareness-tab-indicator" floating />
          </q-route-tab>
          <q-route-tab :to="{ name: 'Options', params: { project: API.project } }" label="Options">
            <awareness-indicator id="Options" class="awareness-tab-indicator" floating />
          </q-route-tab>
          <q-route-tab :to="{ name: 'History', params: { project: API.project } }" label="History">
            <awareness-indicator id="History" class="awareness-tab-indicator" floating />
          </q-route-tab>
        </q-tabs>
        <q-space></q-space>
        <div class="awareness-avatars">
          <q-avatar
            v-for="(user, id, n) in API.connected"
            :key="id"
            :class="`awareness-avatar awareness-bg-color-${API.getColorIndex(Number(id))}`"
            text-color="white"
            :style="`right: ${n * 18}px`"
          >
            {{ user.username[0] }}
            <q-tooltip>{{ user.username }}</q-tooltip>
          </q-avatar>
        </div>
      </q-toolbar>
    </q-header>
    <q-drawer
      v-if="['Edit', 'Scan', 'ScanPreview'].includes(String(route.name))"
      show-if-above
      side="left"
      bordered
      :width="['Scan', 'ScanPreview'].includes(String(route.name)) ? 480 : 320"
      :model-value="store.drawerLeftVisible"
      @update:model-value="store.setDrawerLeft($event)"
    >
      <router-view name="LeftDrawer" />
    </q-drawer>
    <q-page-container class="main">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/stores/store';
import { useApiStore } from '@/stores/api';
import AwarenessIndicator from '@/components/AwarenessIndicator.vue';

const API = useApiStore();
const router = useRouter();
const route = useRoute();
const store = useStore();

function goHome() {
  if (route.name !== 'Home') {
    router.push({ name: 'Home' });
  }
}
</script>
<style scoped>
.main {
  background-color: #fafafa;
}
.main-toolbar {
  min-height: 30px;
}
.main-toolbar .q-toolbar__title {
  font-size: 16px;
}
.main-toolbar .q-avatar img {
  width: 30px;
  height: 30px;
}
.awareness-avatars {
  position: relative;
  width: 200px;
  align-self: stretch;
}

.awareness-avatar {
  border: 2px solid white;
  font-size: 24px;
  box-sizing: content-box;
  position: absolute;
  top: 4px;
}
.awareness-tab-indicator {
  right: -12px;
  top: 4px;
}
</style>
