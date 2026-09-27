<template>
  <q-page class="bg-grey-3 column">
    <q-toolbar v-if="!store.drawerLeftVisible" class="bg-white">
      <q-btn
        flat
        dense
        round
        icon="sym_o_menu"
        aria-label="Menu"
        @click="store.setDrawerLeft(true)"
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
        <q-btn color="primary" label="Save" size="lg" @click="saveMode" />
        <q-space />
      </div>
    </q-banner>
    <score-why-banner></score-why-banner>
    <router-view></router-view>
    <div v-if="!route.params.page" class="col flex flex-center">
      <h1 class="text-grey-6 text-h4 text-bold">No page selected for preview</h1>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';

import ScoreWhyBanner from '@/components/ScoreWhyBanner.vue';

export default defineComponent({
  name: 'Scan',
  components: {
    ScoreWhyBanner
  },
  setup() {
    const API = useApiStore();
    const store = useStore();
    const route = useRoute();
    const autoCaptureMode = ref(
      API.options.options.auto_capture_mode === '-1'
        ? undefined
        : API.options.options.auto_capture_mode
    );
    return {
      autoCaptureMode,
      store,
      API,
      route,
      saveMode() {
        API.options.options.auto_capture_mode = autoCaptureMode.value || '-1';
        API.saveOptions();
      }
    };
  }
});
</script>
