<template>
  <div @wheel="zoomMain">
    <SPZ
      class="thumbnail"
      :zoom-enabled="false"
      :pan-enabled="false"
      :control-icons-enabled="false"
      :dbl-click-zoom-enabled="false"
      :prevent-mouse-events-default="true"
      @created="thumbnailSPZcreated"
    >
      <slot class="thumbnail" />
    </SPZ>
    <Scope v-if="thumbnailSPZ" :main-s-p-z="mainSPZ" :thumbnail-s-p-z="thumbnailSPZ" />
  </div>
</template>

<script setup lang="ts">
import { ref, type PropType } from 'vue';
import Scope from './Scope.vue';
import SPZ from './SvgPanZoom.vue';

const props = defineProps({
  mainSPZ: {
    type: Object as PropType<SvgPanZoom.Instance>,
    required: true
  }
});

const emit = defineEmits(['thumbnailCreated']);

const thumbnailSPZ = ref<SvgPanZoom.Instance | null>(null);

function zoomMain(evt: WheelEvent) {
  props.mainSPZ[evt.deltaY < 0 ? 'zoomIn' : 'zoomOut']();
}

function thumbnailSPZcreated(spz: SvgPanZoom.Instance) {
  thumbnailSPZ.value = spz;
  emit('thumbnailCreated', spz);
}
</script>

<style>
.thumbView {
  z-index: 110;
  background: white;
}
.thumbnail {
  position: absolute;
  bottom: 5px;
  left: 5px;
  width: 20%;
  height: 30%;
  margin: 3px;
  padding: 3px;
  overflow: hidden;
  z-index: 120;
}
.thumbnail svg {
  width: 100% !important;
  height: 100% !important;
}
</style>
