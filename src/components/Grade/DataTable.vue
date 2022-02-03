<template>
  <div v-if="!gradeService.grade.isLoading">
    <div class="text-h6">Datatable</div>
    <table class="datatable">
      <colgroup>
        <col />
        <col
          v-for="(c, index) in table[0]"
          :key="index"
          :class="c === maxPoints.toString() ? 'bg-grey-3' : ''"
        />
      </colgroup>
      <tr>
        <th>Points</th>
        <th v-for="(c, index) in table[0]" :key="index" class="text-right">
          {{ c }}
        </th>
      </tr>
      <tr>
        <th class="text-left">AVG</th>
        <td v-for="(c, index) in table[1]" :key="index" class="text-right">
          {{ c }}
        </td>
      </tr>
      <tr>
        <th class="text-left">Min</th>
        <td v-for="(c, index) in table[5]" :key="index" class="text-right">
          {{ c }}
        </td>
      </tr>
      <tr>
        <th class="text-left">Max</th>
        <td v-for="(c, index) in table[6]" :key="index" class="text-right">
          {{ c }}
        </td>
      </tr>
      <tr>
        <th class="text-left">Pass</th>
        <td v-for="(c, index) in table[2]" :key="index" class="text-right">
          {{ c }}%
        </td>
      </tr>
      <tr>
        <th class="text-left">Remed</th>
        <td v-for="(c, index) in table[3]" :key="index" class="text-right">
          {{ c }}%
        </td>
      </tr>
      <tr>
        <th class="text-left">Fail</th>
        <td v-for="(c, index) in table[4]" :key="index" class="text-right">
          {{ c }}%
        </td>
      </tr>
    </table>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, computed } from 'vue';
import GradeService from '../../services/grade';
import Api from '../../services/api';

export default defineComponent({
  name: 'DataTable',
  props: {
    maxPoints: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const gradeService = inject('gradeService') as GradeService;
    const API = inject('API') as Api;
    const delta = 5;
    const minGrade = parseFloat(API.options.options.note_min);
    const maxGrade = parseFloat(API.options.options.note_max);

    const tableData = computed(() => {
      // maxPoints, AVG, Pass, Remed, Fail
      const table = [[], [], [], [], [], [], []] as string[][];
      for (
        let max = props.maxPoints - delta;
        max <= delta + props.maxPoints;
        max++
      ) {
        const iteration = {
          count: 0,
          total: 0,
          pass: 0,
          remed: 0,
          fail: 0,
          min: maxGrade,
          max: minGrade,
        };
        for (let i = 0; i < gradeService.grade.students.data.length; i++) {
          const score =
            gradeService.grade.scores[gradeService.grade.students.data[i].id];
          if (!score) continue;
          const value = score.total;

          if (isNaN(value)) continue;
          const gradeScaled = gradeService.computedRoundedScaledGrade(
            value,
            max
          );
          //TODO-nice: make configurable? #45
          if (gradeScaled >= 4) {
            iteration.pass++;
          } else if (gradeScaled >= 3.5) {
            iteration.remed++;
          } else {
            iteration.fail++;
          }
          iteration.min = Math.min(iteration.min, gradeScaled);
          iteration.max = Math.max(iteration.max, gradeScaled);
          iteration.total += gradeScaled;
          iteration.count++;
        }

        table[0].push(max.toString());
        // TODO-nice configure number fixed
        table[1].push((iteration.total / iteration.count).toFixed(2));
        table[2].push(
          Math.round((iteration.pass / iteration.count) * 100).toString()
        );
        table[3].push(
          Math.round((iteration.remed / iteration.count) * 100).toString()
        );
        table[4].push(
          Math.round((iteration.fail / iteration.count) * 100).toString()
        );
        table[5].push(iteration.min.toFixed(2));
        table[6].push(iteration.max.toFixed(2));
      }
      return table;
    });

    return {
      table: tableData,
      gradeService,
    };
  },
});
</script>
<style scoped>
.datatable {
  border-spacing: 4px 0;
}
.datatable td {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
