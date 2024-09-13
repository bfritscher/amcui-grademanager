<template>
  <div class="awareness-indicators" :class="{ floating: floating }">
    <div
      v-for="p in API.awarenessIndex[props.id]"
      :key="p.id"
      class="awareness-indicator"
      :class="`awareness-bg-color-${API.getColorIndex(p.id)}`"
    >
      <q-tooltip>{{ p.user?.username }}</q-tooltip>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useAttrs } from 'vue';
import { useApiStore } from '@/stores/api';

const props = defineProps({
  id: {
    type: String,
    required: true
  }
});
const attrs = useAttrs();
const API = useApiStore();
const floating = Object.hasOwnProperty.call(attrs, 'floating');
</script>
<style scoped>
.awareness-indicators {
  display: inline-block;
}

.floating {
  position: absolute;
  top: 0;
  right: 0;
  flex-direction: column;
  display: flex;
}

.awareness-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin: 1px;
}
</style>
