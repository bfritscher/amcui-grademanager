<template>
  <q-dialog ref="dialogRef" :maximized="$q.screen.lt.sm" @hide="onDialogHide">
    <q-card class="q-dialog-plugin">
      <q-toolbar class="bg-primary text-white">
        <q-toolbar-title> Document Properties </q-toolbar-title>
        <q-btn flat round dense icon="sym_o_close" @click="onDialogOK" />
      </q-toolbar>
      <div class="column scroll">
        <q-card-section>
          <div v-for="key in properties" :key="key">
            <awareness-q-input
              :id="`property-${key}`"
              :model-value="examService.exam.properties[key]"
              :label="key"
              :error="!sourceProperties.includes(key)"
              :error-message="`Property \\AMCUI${key} not found in source.tex`"
              debounce="500"
              @update:model-value="examService.updateProperty(key, String($event))"
            >
              <template #after>
                <q-btn
                  color="negative"
                  flat
                  icon="sym_o_delete_forever"
                  :disable="sourceProperties.includes(key)"
                  @click="examService.removeProperty(key)"
                />
              </template>
            </awareness-q-input>
          </div>
        </q-card-section>
      </div>
      <q-separator />
      <q-card-actions align="right" class="row no-wrap">
        <span
          >Display any <code>\AMCUI<i>property_name</i></code> from source.tex in latex
          options.</span
        >
        <q-space />
        <q-btn color="primary" flat label="close" @click="onDialogOK" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { ref, watch } from 'vue';
import { useDialogPluginComponent } from 'quasar';
import { defineComponent, computed } from 'vue';
import { useExamStore } from '@/stores/exam';
import AwarenessQInput from '@/components/AwarenessQInput.vue';
export default defineComponent({
  components: {
    AwarenessQInput
  },
  emits: [
    // REQUIRED; need to specify some events that your
    // component will emit through useDialogPluginComponent()
    ...useDialogPluginComponent.emits
  ],
  setup() {
    // REQUIRED; must be called inside of setup()
    const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
    // dialogRef      - Vue ref to be applied to QDialog
    // onDialogHide   - Function to be used as handler for @hide on QDialog
    // onDialogOK     - Function to call to settle dialog with "ok" outcome
    //                    example: onDialogOK() - no payload
    //                    example: onDialogOK({ /*.../* }) - with payload
    // onDialogCancel - Function to call to settle dialog with "cancel" outcome
    const examService = useExamStore();

    const properties = computed(() => {
      const keys = Object.keys(examService.exam.properties);
      keys.sort();
      return keys;
    });
    const sourceProperties = ref<string[]>([]);
    watch(
      () => examService.exam.source,
      () => {
        sourceProperties.value = examService.getPropertiesFromLatexLayout();
        for (const key of sourceProperties.value) {
          if (!Object.prototype.hasOwnProperty.call(examService.exam.properties, key)) {
            examService.updateProperty(key, '');
          }
        }
      },
      {
        immediate: true
      }
    );
    return {
      examService,
      sourceProperties,
      dialogRef,
      onDialogHide,
      onDialogOK,
      properties
    };
  }
});
</script>
