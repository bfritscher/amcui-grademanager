<template>
  <div ref="chart"></div>
</template>
<script lang="ts">
import { defineComponent, ref, type PropType, watchEffect } from 'vue';
import Plotly from 'plotly.js-cartesian-dist-min';

export default defineComponent({
  name: 'Histogram',
  props: {
    values: {
      type: Array as PropType<number[]>,
      required: true
    },
    min: {
      type: Number as PropType<number>,
      default: 0
    },
    max: {
      type: Number as PropType<number>,
      default: 1
    }
  },
  setup(props) {
    const chart = ref<HTMLElement>();

    function drawChart(options: { values: number[]; min: number; max: number }) {
      const trace = {
        x: options.values,
        type: 'histogram',
        xbins: {
          size: 1.0
        },
        marker: {
          color: 'rgba(33, 150, 243, 0.5)',
          line: {
            color: 'rgba(33, 150, 243, 1.0)',
            width: 1
          }
        }
      };
      const data = [trace] as Plotly.Data[];
      const layout = {
        bargroupgap: 0.1,
        xaxis: {
          title: 'Points',
          fixedrange: true,
          range: [options.min, options.max]
        },
        yaxis: { title: 'Count', fixedrange: true },
        margin: {
          t: 40,
          b: 40,
          l: 40,
          r: 40
        }
      };
      const config = {
        responsive: true,
        displayModeBar: false
      };
      if (chart.value) {
        Plotly.newPlot(chart.value, data, layout, config);
      }
    }

    watchEffect(() => {
      if (chart.value && props.values.length > 0) {
        drawChart({
          values: props.values,
          min: props.min,
          max: props.max
        });
      }
    });

    return {
      chart
    };
  }
});
</script>
