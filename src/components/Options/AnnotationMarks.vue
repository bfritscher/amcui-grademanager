<template>
  <tr>
    <td class="text-center">
      <q-icon size="md" :style="`color: ${color}`" :name="icon"/>
    </td>
    <td class="text-center">
      {{ toBeTicked ? "yes" : "no" }}
    </td>
    <td class="text-center">
      {{ ticked ? "yes" : "no" }}
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
        :class="{selected: color === btnColor}"
        flat
        @click="color = btnColor"
      >
      </q-btn>
    </td>
  </tr>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  name: 'AnnotationMarks',

  props: {
    toBeTicked: {
      type: Boolean,
      required: true,
    },
    ticked: {
      type: Boolean,
      required: true,
    },
    value: {
      type: Object,
      required: true,
      default() {
        return {};
      },
    },
  },
  emits: ['change'],
  data: () => ({
    options: ['none', 'circle', 'mark', 'box'],
    colors: ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  }),
  computed: {
    type: {
      get() {
        return this.value[
          `symbole_${Number(this.toBeTicked)}_${Number(this.ticked)}_type`
        ];
      },
      set(newValue: string) {
        this.API.options.options[
          `symbole_${Number(this.toBeTicked)}_${Number(this.ticked)}_type`
        ] = newValue;
        // to save options from parent
        this.$emit('change');
      },
    },
    color: {
      get() {
        return this.value[
          `symbole_${Number(this.toBeTicked)}_${Number(this.ticked)}_color`
        ];
      },
      set(newValue: string) {
        this.API.options.options[
          `symbole_${Number(this.toBeTicked)}_${Number(this.ticked)}_color`
        ] = newValue;
        // to save options from parent
        this.$emit('change');
      },
    },
    icon() {
      let icon = '';
      if (this.type === 'circle') icon = 'mdi-circle-outline';
      else if (this.type === 'mark') icon = 'mdi-close';
      else if (this.type === 'box') icon = 'mdi-square-outline';
      return icon;
    },
  },
});
</script>
<style scoped>
.selected {
  border: 2px solid rgb(33, 150, 243);
}
</style>
