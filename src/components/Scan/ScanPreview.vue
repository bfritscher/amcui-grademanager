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
      @created="registerSvgPanZoom"
    >
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        width="100%"
        height="100%"
      >
        <defs>
          <filter id="dropshadow">
            <feDropShadow dx="8" dy="6" stdDeviation="0" flood-opacity="0.1" />
          </filter>
          <linearGradient id="whyVackGradient" gradientTransform="rotate(45)">
            <stop offset="70%" stop-color="rgb(241, 233, 56)" />
            <stop offset="70%" stop-color="rgb(76, 175, 80)" />
          </linearGradient>
          <linearGradient id="whyEackGradient" gradientTransform="rotate(45)">
            <stop offset="70%" stop-color="rgb(255, 84, 84)" />
            <stop offset="70%" stop-color="rgb(76, 175, 80)" />
          </linearGradient>
          <linearGradient id="whyPackGradient" gradientTransform="rotate(45)">
            <stop offset="70%" stop-color="rgb(213, 188, 236)" />
            <stop offset="70%" stop-color="rgb(76, 175, 80)" />
          </linearGradient>
        </defs>
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
            style="filter: url(#dropshadow)"
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
          <rect
            v-for="[key, value] in boxWhys"
            :key="key"
            :x="keyToX(key)"
            :y="keyToY(key)"
            width="50px"
            height="50px"
            :fill="
              gradeService.acknowledgedWhys.value.includes(key)
                ? `url(#why${value}ackGradient)`
                : value === 'E'
                  ? 'rgba(255, 84, 84, 0.8)'
                  : value === 'V'
                    ? 'rgba(241, 233, 56, 0.8)'
                    : ''
            "
            :title="value"
            @click="gradeService.acknowledgeWhy(key)"
          />
        </g>
      </svg>
    </svg-pan-zoom>
    <div
      v-if="boxWhys.length > 0"
      class="absolute absolute-top-left text-caption"
      style="width: 200px"
    >
      Fix the scan detectin problem by manually ticking the right boxes.<br />
      Or if the scan is correct, click on the yellow/red square to acknowledge the problem is on the
      original copy.
    </div>
    <q-btn
      color="negative"
      class="absolute absolute-top-right"
      :disable="page && page.timestamp_manual === 0"
      @click="clear()"
      >remove manual
      <q-tooltip>Remove manually set ticks</q-tooltip>
    </q-btn>
    <q-checkbox v-model="rotate" label="rotate" class="absolute absolute-bottom-left"></q-checkbox>
  </div>
</template>
<script setup lang="ts">
import type { PageCapture, Zone } from '../models';
import { ref, computed, watch, onUnmounted, onMounted, inject } from 'vue';
import { useRoute } from 'vue-router';
import { useApiStore } from '@/stores/api';
import { useStore } from '@/stores/store';
import GradeService from '@/services/grade';

import SvgPanZoom from '../vue-svg-pan-zoom';

const gradeService = inject('gradeService') as GradeService;
gradeService.loadScores();

const route = useRoute();
const API = useApiStore();
const store = useStore();

const page = ref<PageCapture | undefined>();
const zones = ref<Zone[]>([]);
const rotate = ref(true);
const svgpanzoom = ref<any>(null);

const pageSrc = computed(() => {
  if (page.value && page.value.layout_image) {
    return `${API.URL}/project/${route.params.project}/static/cr/${page.value.layout_image}?token=${store.token}`;
  }
  return '';
});

const boxQuestion = computed(() => {
  if (!route.params.question === undefined || isNaN(Number(route.params.question))) {
    return '';
  }
  const question = parseInt(route.params.question as string, 10);
  const questionZones = zones.value.filter((z) => z.question === question);
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
      ymax: 0
    }
  );
  const pad = 20;
  xmin -= pad;
  ymin -= pad;
  xmax += pad;
  ymax += pad;
  return `M ${xmin} ${ymin} L${xmin} ${ymax} L${xmax} ${ymax} L${xmax} ${ymin} Z`;
});

const questions = computed(() => {
  return zones.value.reduce(
    (questions, z) => {
      if (!questions.hasOwnProperty(z.question)) {
        questions[z.question] = {
          xmax: 0,
          ymin: Infinity
        };
      }
      questions[z.question].xmax = Math.max(questions[z.question].xmax, z.x0, z.x1, z.x2, z.x3);
      questions[z.question].ymin = Math.min(questions[z.question].ymin, z.y0, z.y1, z.y2, z.y3);
      return questions;
    },
    {} as Record<string, { xmax: number; ymin: number }>
  );
});

const boxWhys = computed(() => {
  // for current page get all whys (student/copy/question)
  const questionsIds = Object.keys(questions.value);
  const whysOfPage = Object.entries(gradeService.grade.whys).filter(([key, value]) => {
    const [student, copy, question] = key.split(':'); // TODO check if not copy?
    return (
      value &&
      copy === route.params.copy &&
      student === route.params.student &&
      questionsIds.includes(question)
    );
  });
  return whysOfPage;
});

function keyToX(key: string) {
  const [, , question] = key.split(':');
  return questions.value[question].xmax + 30;
}

function keyToY(key: string) {
  const [, , question] = key.split(':');
  return questions.value[question].ymin - 4;
}

watch(route, () => {
  loadPage();
});

window.addEventListener('resize', () => {
  resizeHandler();
});

onMounted(() => {
  loadPage();
});

onUnmounted(() => {
  window.removeEventListener('resize', () => {
    resizeHandler();
  });
});

function loadPage() {
  page.value = undefined;
  API.$http
    .get(
      API.URL +
        '/project/' +
        route.params.project +
        '/capture/' +
        route.params.student +
        '/' +
        route.params.page +
        ':' +
        route.params.copy
    )
    .then((r) => {
      page.value = r.data;
    });
  API.$http
    .get(
      API.URL +
        '/project/' +
        route.params.project +
        '/zones/' +
        route.params.student +
        '/' +
        route.params.page +
        ':' +
        route.params.copy
    )
    .then((r) => {
      zones.value = r.data;
    });
}

function registerSvgPanZoom(data: any) {
  svgpanzoom.value = data;
}

function resizeHandler() {
  if (svgpanzoom.value) {
    svgpanzoom.value.resize();
    svgpanzoom.value.fit();
    svgpanzoom.value.center();
  }
}

function ticked(zone: Zone) {
  if (zone.manual >= 0) {
    return zone.manual === 1;
  }
  if (zone.total <= 0) {
    return false;
  }
  return zone.black >= parseFloat(API.options.options.seuil) * zone.total;
}

function toggle(zone: Zone) {
  if (zone.manual === 0) {
    zone.manual = 1;
  } else if (zone.manual === 1) {
    zone.manual = 0;
  } else {
    zone.manual = zone.black >= parseFloat(API.options.options.seuil) * zone.total ? 0 : 1;
  }
  API.setZoneManual(route.params.project as string, {
    student: parseInt(route.params.student as string, 10),
    page: parseInt(route.params.page as string, 10),
    copy: parseInt(route.params.copy as string, 10),
    manual: zone.manual,
    type: 4,
    id_a: zone.question,
    id_b: zone.answer
  }).then(() => {
    if (page.value) {
      page.value.timestamp_manual = Date.now();
    }
    gradeService.loadScores();
  });
}

function clear() {
  zones.value.forEach((z) => {
    z.manual = -1;
  });
  API.setPageAuto(route.params.project as string, {
    student: parseInt(route.params.student as string, 10),
    page: parseInt(route.params.page as string, 10),
    copy: parseInt(route.params.copy as string, 10)
  }).then(() => {
    if (page.value) {
      page.value.timestamp_manual = 0;
    }
    gradeService.loadScores();
  });
}
</script>
