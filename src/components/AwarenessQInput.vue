<template>
  <div
    class="outlined"
    :class="
      lockingUser
        ? `outlined-active awareness-border-color-${API.getColorIndex(lockingUser.id)}`
        : ''
    "
  >
    <div
      v-if="lockingUser"
      class="user"
      :class="`awareness-color-${API.getColorIndex(lockingUser.id)}`"
    >
      {{ lockingUser.user?.username }}
    </div>
    <!-- @vue-ignore -->
    <q-input
      v-bind="forwardAttrs"
      :disable="!!lockingUser"
      @focus="API.addAwarenessLocation($attrs.id as string)"
      @blur="API.removeAwarenessLocation($attrs.id as string)"
    >
      <!-- @vue-skip -->
      <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
        <slot :name="slotName" v-bind="slotProps ?? {}" />
      </template>
    </q-input>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { useApiStore } from '@/stores/api';

const API = useApiStore();
const attrs = useAttrs();
const lockingUser = computed(() => {
  if (API.awarenessIndex[attrs.id as string] && API.awarenessIndex[attrs.id as string].length > 0) {
    return API.awarenessIndex[attrs.id as string][0];
  }
  return undefined;
});

const forwardAttrs = computed(() => {
  let forwardProps = { ...attrs };
  delete forwardProps.disable;
  return forwardProps;
});
</script>
<style scoped>
.outlined {
  border: 2px solid transparent;
  border-radius: 4px;
  position: relative;
}
.outlined-active .q-field {
  filter: blur(3px);
}
.user {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
