<template>
  <tr>
    <td class="text-center">
      <q-icon size="md" :style="`color: ${color}`" :name="icon" />
    </td>
    <td class="text-center">
      {{ toBeTicked ? 'yes' : 'no' }}
    </td>
    <td class="text-center">
      {{ ticked ? 'yes' : 'no' }}
    </td>
    <td class="text-center">
      <q-select v-model="type" :options="options"></q-select>
    </td>
    <td class="text-center">
      <q-btn
        v-for="(btnColor, index) in colors"
        :key="index"
        class="q-mx-sm"
        :style="`background-color: ${btnColor}`"
        :class="{ selected: color === btnColor }"
        flat
        @click="color = btnColor"
      >
      </q-btn>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { useApiStore } from '@/stores/api';
import { ref, computed } from 'vue';

const props = defineProps({
  toBeTicked: {
    type: Boolean,
    required: true
  },
  ticked: {
    type: Boolean,
    required: true
  },
  value: {
    type: Object,
    required: true,
    default() {
      return {};
    }
  }
});

const emit = defineEmits(['change']);

const API = useApiStore();

const options = ref(['none', 'circle', 'mark', 'box']);
const colors = ref(['#000000', '#ff0000', '#00ff00', '#0000ff']);
const type = computed({
  get() {
    return props.value[`symbole_${Number(props.toBeTicked)}_${Number(props.ticked)}_type`];
  },
  set(newValue: string) {
    API.options.options[`symbole_${Number(props.toBeTicked)}_${Number(props.ticked)}_type`] =
      newValue;
    // to save options from parent
    emit('change');
  }
});
const color = computed({
  get() {
    return props.value[`symbole_${Number(props.toBeTicked)}_${Number(props.ticked)}_color`];
  },
  set(newValue: string) {
    API.options.options[`symbole_${Number(props.toBeTicked)}_${Number(props.ticked)}_color`] =
      newValue;
    // to save options from parent
    emit('change');
  }
});
const icon = computed(() => {
  let icon = '';
  if (type.value === 'circle') icon = 'sym_o_circle';
  else if (type.value === 'mark') icon = 'sym_o_close';
  else if (type.value === 'box') icon = 'sym_o_square';
  return icon;
});
</script>
<style scoped>
.selected {
  border: 2px solid rgb(33, 150, 243);
}
</style>
