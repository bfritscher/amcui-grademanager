<script setup lang="ts">
import { provide } from 'vue';
import { RouterView } from 'vue-router';
import GradeService from './services/grade';

provide('gradeService', new GradeService());
</script>

<template>
  <RouterView />
</template>
