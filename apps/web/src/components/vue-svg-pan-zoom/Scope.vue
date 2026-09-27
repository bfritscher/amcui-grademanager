<template>
  <svg
    ref="scopeSVG"
    class="thumbViewClass"
    @click="updateMainViewPan"
    @mousemove="updateMainViewPan"
  >
    <rect class="scope" :x="x" :y="y" :width="width" :height="height" />
  </svg>
</template>

<script setup lang="ts">
import { ref, onMounted, type PropType } from 'vue';

const props = defineProps({
  mainSPZ: { type: Object as PropType<SvgPanZoom.Instance>, required: true },
  thumbnailSPZ: { type: Object as PropType<SvgPanZoom.Instance>, required: true }
});
const x = ref(0);
const y = ref(0);
const width = ref(0);
const height = ref(0);

const scopeSVG = ref<SVGElement | null>(null);

function updateScope() {
  if (!props.mainSPZ || !props.thumbnailSPZ) return;

  const mainPanX = props.mainSPZ.getPan().x,
    mainPanY = props.mainSPZ.getPan().y,
    mainWidth = props.mainSPZ.getSizes().width,
    mainHeight = props.mainSPZ.getSizes().height,
    mainZoom = props.mainSPZ.getSizes().realZoom,
    thumbPanX = props.thumbnailSPZ.getPan().x,
    thumbPanY = props.thumbnailSPZ.getPan().y,
    thumbZoom = props.thumbnailSPZ.getSizes().realZoom;

  const thumByMainZoomRatio = thumbZoom / mainZoom;

  const scopeX = thumbPanX - mainPanX * thumByMainZoomRatio;
  const scopeY = thumbPanY - mainPanY * thumByMainZoomRatio;
  const scopeWidth = mainWidth * thumByMainZoomRatio;
  const scopeHeight = mainHeight * thumByMainZoomRatio;

  x.value = scopeX + 1;
  y.value = scopeY + 1;
  width.value = scopeWidth - 2;
  height.value = scopeHeight - 2;
}

function updateMainViewPan(evt: MouseEvent) {
  if ((evt.which == 0 && evt.button == 0) || !scopeSVG.value) return;

  const dim = scopeSVG.value.getBoundingClientRect(),
    mainZoom = props.mainSPZ.getSizes().realZoom,
    thumbWidth = props.thumbnailSPZ.getSizes().width,
    thumbHeight = props.thumbnailSPZ.getSizes().height,
    thumbZoom = props.thumbnailSPZ.getSizes().realZoom;

  const thumbPanX = evt.clientX - dim.left - thumbWidth / 2;
  const thumbPanY = evt.clientY - dim.top - thumbHeight / 2;
  const mainPanX = (-thumbPanX * mainZoom) / thumbZoom;
  const mainPanY = (-thumbPanY * mainZoom) / thumbZoom;
  props.mainSPZ.pan({ x: mainPanX, y: mainPanY });
}

onMounted(() => {
  updateScope();
  props.mainSPZ.setOnPan(() => updateScope());
  props.mainSPZ.setOnZoom(() => updateScope());
});
</script>
<style scoped>
.scope {
  fill: red;
  fill-opacity: 0.1;
  stroke: red;
  stroke-width: 2px;
}

svg.thumbViewClass {
  border: 1px solid black;
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
</style>
