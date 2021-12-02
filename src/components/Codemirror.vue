<template>
  <div ref="dom" class="codemirror-container"></div>
</template>
<script lang="ts">
import { defineComponent, ref, onMounted, watch, PropType } from 'vue';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';

export default defineComponent({
  props: {
    modelValue: {
      type: String as PropType<string>,
      required: true,
    },
    options: {
      type: Object as PropType<any>,
      required: false,
      default() {
        return {};
      },
    },
  },
  emits: ['update:modelValue'],
  setup(props: {modelValue: string, options:any}, { emit }) {
    const dom = ref(null);
    const content = ref<string>(props.modelValue || '');
    let cmInstance: any // CodeMirror.Editor;

    watch(
      () => props.options,
      () => {
        if (cmInstance) {
          for (const key in props.options) {
            cmInstance.setOption(key, props.options[key]);
          }
        }
      },
      { deep: true }
    );

    watch(
      () => props.modelValue,
      () => {
        if (cmInstance && cmInstance.getValue() !== content.value) {
          cmInstance.setValue(content.value);
        }
      }
    );

    onMounted(() => {
      if (!dom.value) return;
      cmInstance = CodeMirror(
        dom.value,
        Object.assign(
          {
            value: content.value,
            viewportMargin: Infinity,
          },
          props.options
        ) as CodeMirror.EditorConfiguration
      );
      cmInstance.on('change', (cm: any) => {
        const value = cm.getValue();
        if (value == content.value) return;
        content.value = value;
        emit('update:modelValue', value);
      });
    });

    return {
      dom,
    };
  },
});
</script>
<style>
.codemirror-container .CodeMirror {
  height: auto;
}
</style>