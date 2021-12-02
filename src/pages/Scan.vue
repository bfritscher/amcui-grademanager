<template>
  <q-page class="bg-grey-3 column">
    <q-toolbar v-if="!$store.state.drawerLeftVisible" class="bg-white">
      <q-btn
        flat
        dense
        round
        icon="menu"
        aria-label="Menu"
        @click="$store.commit('SET_DRAWER_LEFT', true)"
      />
    </q-toolbar>
    <!-- TODO-css check color and function -->
    <q-banner
      v-if="
        API.options.options.auto_capture_mode !== '0' &&
        API.options.options.auto_capture_mode !== '1'
      "
      inline-actions
      class="text-white bg-red"
    >
      <div class="row items-center">
        You have to choose the type of scans you use for this project:
        <q-select
          v-model="autoCaptureMode"
          label="Type of scans"
          style="width: 350px"
          class="q-mx-md" 
          map-options
          emit-value
          filled
          :options="API.typeOfScan"
        ></q-select>
        <q-btn color="primary" label="Save" size="lg"  @click="saveMode" />
        <q-space />
      </div>
    </q-banner>
    <router-view></router-view>
    <div v-if="!$route.params.page" class="col flex flex-center">
      <h1 class="text-grey-6 text-h4 text-bold">
        No page selected for preview
      </h1>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue';
import Api from '../services/api';

export default defineComponent({
  name: 'Scan',
  setup() {
    const API = inject('API') as Api;
    const autoCaptureMode = ref(
      API.options.options.auto_capture_mode === '-1'
        ? undefined
        : API.options.options.auto_capture_mode
    );
    return {
      autoCaptureMode,
      saveMode() {
        API.options.options.auto_capture_mode = autoCaptureMode.value || '-1';
        API.saveOptions();
      },
    };
  },
});
</script>
