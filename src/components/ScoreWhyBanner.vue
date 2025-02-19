<template>
  <q-banner
    v-if="gradeService.whysQueue.value.length > 0 || gradeService.acknowledgedWhys.value.length > 0"
    dense
    inline-actions
    class=""
    :class="{ 'bg-negative text-white': gradeService.whysQueue.value.length > 0 }"
  >
    {{ gradeService.acknowledgedWhys.value.length }} acknowledged problems of
    {{ gradeService.whysCount.value['E'] || 0 }} errors and
    {{ gradeService.whysCount.value['V'] || 0 }} empty questions.
    {{ gradeService.whysQueue.value.length }} remaining problems
    <q-btn
      v-if="gradeService.whysQueue.value.length > 0"
      flat
      color="white"
      label="Show Next"
      :to="gradeService.nextWhyRoute.value"
    />
  </q-banner>
</template>
<script setup lang="ts">
import { inject } from 'vue';
import GradeService from '@/services/grade';
const gradeService = inject('gradeService') as GradeService;
</script>
