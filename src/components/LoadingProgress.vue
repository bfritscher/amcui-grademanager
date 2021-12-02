<template>
  <q-page class="flex flex-center">
    <div class="row no-wrap items-center">
      <q-circular-progress
        indeterminate
        size="75px"
        :thickness="0.4"
        color="primary"
      />
      <div class="text-h2 q-pl-lg text-grey-8">Loading</div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  setup() {
    name: 'LoadingProgress'
  },
});
</script>
