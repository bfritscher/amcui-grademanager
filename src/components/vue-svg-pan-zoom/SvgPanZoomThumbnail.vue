<template>
  <div @wheel="zoomMain">
    <SPZ
      class="thumbnail"
      :zoom-enabled="false"
      :pan-enabled="false"
      :control-icons-enabled="false"
      :dbl-click-zoom-enabled="false"
      :prevent-mouse-events-default="true"
      @svgpanzoom="thumbnailSPZcreated"
    >
      <slot class="thumbnail" />
    </SPZ>
    <Scope :bus="bus" :main-s-p-z="mainSPZ" :thumbnail-s-p-z="thumbnailSPZ" />
  </div>
</template>

<script>
import Scope from './Scope.vue';

export default {
  components: { Scope },
  props: {
    //eslint-disable-next-line
    onThumbnailShown: {
      type: [Object, Function],
    },
    //eslint-disable-next-line
    mainSPZ: {
      type: [Object],
    },
    //eslint-disable-next-line
    bus: {
      type: [Object],
    },
  },
  data: () => ({
    thumbnailSPZ: null,
  }),
  beforeCreate: function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.$options.components.SPZ = require('./SvgPanZoom.vue').default;
  },
  mounted() {
    if (this.onThumbnailShown) {
      this.onThumbnailShown();
    }
  },
  methods: {
    zoomMain(evt) {
      this.mainSPZ[evt.deltaY < 0 ? 'zoomIn' : 'zoomOut']();
    },
    thumbnailSPZcreated(spz) {
      this.thumbnailSPZ = spz;
      this.bus.$emit('thumbnailCreated', spz);
    },
  },
};
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
