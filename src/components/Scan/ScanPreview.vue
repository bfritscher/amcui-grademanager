<template>
  <div class="q-ma-lg col col-grow relative-position">
    <svg-pan-zoom
      v-if="page"
      class="absolute absolute-top-right absolute-bottom-left"
      :zoom-enabled="true"
      :control-icons-enabled="true"
      :center="true"
      :fit="true"
      :max-zoom="5"
      :min-zoom="0.05"
      @svgpanzoom="registerSvgPanZoom"
    >
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        width="100%"
        height="100%"
      >
        <filter id="dropshadow">
          <feDropShadow dx="8" dy="6" stdDeviation="0"  flood-opacity="0.1"/>

        </filter>
        <g
          :transform="
            rotate
              ? 'matrix(' +
                page.a +
                ',' +
                page.b +
                ',' +
                page.c +
                ',' +
                page.d +
                ',' +
                page.e +
                ',' +
                page.f +
                ')'
              : ''
          "
        >
          <rect
            x="0"
            y="0"
            :width="`${page.width}px`"
            :height="`${page.height}px`"
            style="filter: url(#dropshadow);"
            fill="white"
          ></rect>
          <image
            :xlink:href="pageSrc"
            x="0"
            y="0"
            :width="`${page.width}px`"
            :height="`${page.height}px`"
          ></image>
          <path
            v-for="(z, index) in zones"
            :key="index"
            :d="`M ${z.x0} ${z.y0} L${z.x1} ${z.y1} L${z.x2} ${z.y3} L${z.x3} ${z.y3} Z`"
            :stroke="(ticked(z) && 'red') || 'blue'"
            fill="transparent"
            stroke-width="4"
            :stroke-dasharray="(z.manual > -1 && '6,3') || '0'"
            @click="toggle(z)"
          />
          <path
            v-if="boxQuestion"
            fill="yellow"
            fill-opacity="0.3"
            stroke-width="10"
            stroke="#FFEF00"
            :d="boxQuestion"
            style="pointer-events: none"
          />
        </g>
      </svg>
    </svg-pan-zoom>
    <q-btn
      color="negative"
      class="absolute absolute-top-right"
      :disable="page && page.timestamp_manual === 0"
      @click="clear()"
      >remove manual
      <q-tooltip>Remove manually set ticks</q-tooltip>
    </q-btn>
    <q-checkbox
      v-model="rotate"
      label="rotate"
      class="absolute absolute-bottom-left"
    ></q-checkbox>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import { PageCapture, Zone } from '../models';

import SvgPanZoom from '../vue-svg-pan-zoom';

export default defineComponent({
  name: 'ScanPreview',
  components: {
    SvgPanZoom,
  },
  inject: ['API'],
  data() {
    return {
      page: null as PageCapture | null,
      zones: [] as Zone[],
      rotate: true,
      svgpanzoom: null as any,
    };
  },
  computed: {
    pageSrc(): string {
      if (this.page && this.page.layout_image) {
        return `${this.API.URL}/project/${this.$route.params.project}/static/cr/${this.page.layout_image}?token=${this.$store.state.token}`;
      }
      return '';
    },
    boxQuestion(): string {
      if (
        !this.$route.params.question === undefined ||
        isNaN(Number(this.$route.params.question))
      ) {
        return '';
      }
      const question = parseInt(this.$route.params.question as string, 10);
      const questionZones = this.zones.filter((z) => z.question === question);
      if (questionZones.length === 0) {
        return '';
      }
      let { xmin, ymin, xmax, ymax } = questionZones.reduce(
        (acc, z) => {
          acc.xmax = Math.max(acc.xmax, z.x0, z.x1, z.x2, z.x3);
          acc.xmin = Math.min(acc.xmin, z.x0, z.x1, z.x2, z.x3);
          acc.ymax = Math.max(acc.ymax, z.y0, z.y1, z.y2, z.y3);
          acc.ymin = Math.min(acc.ymin, z.y0, z.y1, z.y2, z.y3);
          return acc;
        },
        {
          xmin: Infinity,
          ymin: Infinity,
          xmax: 0,
          ymax: 0,
        }
      );
      const pad = 20;
      xmin -= pad;
      ymin -= pad;
      xmax += pad;
      ymax += pad;
      return `M ${xmin} ${ymin} L${xmin} ${ymax} L${xmax} ${ymax} L${xmax} ${ymin} Z`;
    },
  },
  watch: {
    $route() {
      this.loadPage();
    },
  },
  created() {
    window.addEventListener('resize', () => {
      this.resizeHandler();
    });
  },
  mounted() {
    this.loadPage();
  },
  unmounted() {
    window.removeEventListener('resize', () => {
      this.resizeHandler();
    });
  },
  methods: {
    loadPage() {
      this.page = null;
      this.API.$http
        .get(
          this.API.URL +
            '/project/' +
            this.$route.params.project +
            '/capture/' +
            this.$route.params.student +
            '/' +
            this.$route.params.page +
            ':' +
            this.$route.params.copy
        )
        .then((r) => {
          this.page = r.data;
        });
      this.API.$http
        .get(
          this.API.URL +
            '/project/' +
            this.$route.params.project +
            '/zones/' +
            this.$route.params.student +
            '/' +
            this.$route.params.page +
            ':' +
            this.$route.params.copy
        )
        .then((r) => {
          this.zones = r.data;
        });
    },
    registerSvgPanZoom(svgpanzoom: any) {
      this.svgpanzoom = svgpanzoom;
    },
    resizeHandler() {
      if (this.svgpanzoom) {
        this.svgpanzoom.resize();
        this.svgpanzoom.fit();
        this.svgpanzoom.center();
      }
    },
    ticked(zone: Zone) {
      if (zone.manual >= 0) {
        return zone.manual === 1;
      }
      if (zone.total <= 0) {
        return false;
      }
      return (
        zone.black >= parseFloat(this.API.options.options.seuil) * zone.total
      );
    },
    toggle(zone: Zone) {
      if (zone.manual === 0) {
        zone.manual = 1;
      } else if (zone.manual === 1) {
        zone.manual = 0;
      } else {
        zone.manual =
          zone.black >= parseFloat(this.API.options.options.seuil) * zone.total
            ? 0
            : 1;
      }
      this.API.setZoneManual(this.$route.params.project as string, {
        student: parseInt(this.$route.params.student as string, 10),
        page: parseInt(this.$route.params.page as string, 10),
        copy: parseInt(this.$route.params.copy as string, 10),
        manual: zone.manual,
        type: 4,
        id_a: zone.question,
        id_b: zone.answer,
      });
    },
    clear() {
      this.zones.forEach((z) => {
        z.manual = -1;
      });
      this.API.setPageAuto(this.$route.params.project as string, {
        student: parseInt(this.$route.params.student as string, 10),
        page: parseInt(this.$route.params.page as string, 10),
        copy: parseInt(this.$route.params.copy as string, 10),
      });
    },
  },
});
</script>
