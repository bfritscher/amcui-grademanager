<template>
  <q-layout view="hHh LpR fFf">
    <q-header elevated height-hint="98">
      <q-toolbar>
        <q-toolbar-title>
          <q-avatar square  class="cursor-pointer q-mr-sm" @click="goHome()">
            <img src="../assets/images/auto-multiple-choice.svg" />
          </q-avatar>
          <span class="cursor-pointer" @click="goHome()">Grade Manager (AMC-UI)</span>
          <span v-if="API.project"> > {{ API.project }}</span>
        </q-toolbar-title>

        <q-btn
          flat
          type="a"
          href="https://amcui.ig.he-arc.ch/docs/"
          target="_blank"
        >
          <!-- TODO-nice docs to github? -->
          docs
        </q-btn>

        <q-btn
          v-if="$store.state.user.username"
          flat
          :label="$store.state.user.username"
        >
          <q-menu fit>
            <q-list style="min-width: 140px">
              <q-item v-close-popup clickable @click="API.showProgressDialog()">
                <q-item-section>Task progress</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :to="{ name: 'Profile' }">
                <q-item-section>Edit profile</q-item-section>
              </q-item>
              <q-separator />
              <q-item
                v-close-popup
                clickable
                @click="$store.dispatch('LOGOUT')"
              >
                <q-item-section>Logout</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
      <q-toolbar
        v-if="
          ['Edit', 'Scan', 'ScanPreview', 'Grade', 'History', 'Options'].includes($route.name)
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
          <q-route-tab
            :to="{ name: 'Edit', params: { project: API.project } }"
            label="Edit"
          ></q-route-tab>
          <q-route-tab
            :to="{ name: 'Scan', params: { project: API.project } }"
            :disable="!API.options.status.printed"
            label="Scan"
          ></q-route-tab>
          <q-route-tab
            :to="{ name: 'Grade', params: { project: API.project } }"
            label="Grade"
          ></q-route-tab>
          <q-route-tab
            :to="{ name: 'Options', params: { project: API.project } }"
            label="Options"
          ></q-route-tab>
          <q-route-tab
            :to="{ name: 'History', params: { project: API.project } }"
            label="History"
          ></q-route-tab>
        </q-tabs>
        <q-space></q-space>
        <div v-for="(user, id) in API.connected" :key="id">
          <q-avatar square>
            <img :src="`https://robohash.org/${user.username}?size=44x44`" />
            <q-tooltip>{{ user.username }}</q-tooltip>
          </q-avatar>
        </div>
      </q-toolbar>
    </q-header>
    <q-drawer
      v-if="['Edit', 'Scan', 'ScanPreview'].includes($route.name)"
      show-if-above
      side="left"
      bordered
      :width="['Scan', 'ScanPreview'].includes($route.name) ? 480 : 320"
      :model-value="$store.state.drawerLeftVisible"
      @update:model-value="$store.commit('SET_DRAWER_LEFT', $event)"
    >
      <router-view name="LeftDrawer" />
    </q-drawer>
    <q-page-container class="main">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent, inject } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Api from '../services/api';

export default defineComponent({
  name: 'MainLayout',

  setup() {
    const API = inject('API') as Api;
    const router = useRouter();
    const route = useRoute();

    return {
      API,
      goHome() {
        if (route.name !== 'Home') {
          router.push({ name: 'Home' });
        }
      },
    };
  },
});
</script>
<style scoped>
.main {
  background-color: #fafafa;
}
</style>
