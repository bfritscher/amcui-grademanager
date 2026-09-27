<template>
  <div class="q-px-md q-pb-md">
    <h2 class="text-h5">Global Statistics</h2>
    <div class="row">
      <div class="col-12 col-md-6">
        <q-markup-table dense flat class="my-table">
          <tbody>
            <tr>
              <th class="text-left">Number of students</th>
              <td>{{ ShapiroWilkWAll.n }}</td>
            </tr>
            <tr>
              <th class="text-left">Number of questions</th>
              <td>{{ Object.keys(enableQuestions).length }}</td>
            </tr>
            <tr>
              <th class="text-left">Exam average</th>
              <td>{{ ShapiroWilkWAll.mean.toFixed(2) }}</td>
            </tr>
            <tr>
              <th class="text-left">Standard deviation</th>
              <td>{{ ShapiroWilkWAll.std.toFixed(2) }}</td>
            </tr>
            <tr>
              <th class="text-left">Exam median</th>
              <td>{{ ShapiroWilkWAll.median.toFixed(2) }}</td>
            </tr>
            <tr>
              <th class="text-left">Highest score</th>
              <td>{{ ShapiroWilkWAll.max }}</td>
            </tr>
            <tr>
              <th class="text-left">Lowest score</th>
              <td>{{ ShapiroWilkWAll.min }}</td>
            </tr>
            <tr>
              <th class="text-left">Shapiro-Wilk Normal Test</th>
              <td :class="ShapiroWilkWAllCls">
                <div class="row">
                  {{ ShapiroWilkWAll.w.toFixed(2) }}, p-value =
                  {{ ShapiroWilkWAll.pvalue.toFixed(3) }}
                  <q-space />
                  <q-icon name="sym_o_help">
                    <q-tooltip>
                      <p v-if="ShapiroWilkWAll.accept_null">
                        Accept Null Hypothesis as calculated W is greater than the critical value of
                        W.
                        <span v-if="ShapiroWilkWAll.pvalue < 0.05"
                          >The p-value is less than 0.05 though.</span
                        >
                      </p>
                      <p v-else>
                        Reject Null Hypothesis as calculated W is less than the critical value of W.
                        <span v-if="ShapiroWilkWAll.pvalue > 0.05"
                          >The p-value exceeds 0.05 though.</span
                        >
                      </p>
                    </q-tooltip>
                  </q-icon>
                </div>
              </td>
            </tr>
            <tr>
              <th>Exam reliability (Cronbach alpha)</th>
              <td :class="cronbachAlphaAllCls">
                <div class="row">
                  {{ cronbachAlphaAll.toFixed(3) }}
                  <q-space />
                  <q-icon name="sym_o_help">
                    <q-tooltip>
                      &gt; 0,9 Excellent <br />
                      &gt; 0,8 Good <br />
                      &gt; 0,7 Acceptable <br />
                      &gt; 0,6 Questionable <br />
                      &gt; 0,5 Poor <br />
                      &lt; 0,5 Unacceptable <br />
                    </q-tooltip>
                  </q-icon>
                </div>
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </div>
      <div class="col-12 col-md-6">
        <div class="text-h6">Scores Histogram</div>
        <histogram
          :values="Object.values(gradeService.grade.scores).map((x) => x.total)"
          :min="0"
          :max="gradeService.grade.maxPoints"
        />
      </div>
    </div>
    <h2 class="text-h5">Question and Answers Statistics</h2>

    <q-markup-table dense flat class="my-table my-table-dense my-table-minwidth">
      <tbody>
        <tr>
          <td>P-index</td>
          <td class="text-wrap">
            The difficulty index of the item. It corresponds to ratio of respondents who answer the
            item correctly, i.e.: Ri (number of respondents who answer the item correctly) / Ni
            (number total respondents)
          </td>
          <td>
            <div class="warn">&lt; 0.30: difficult item</div>
            <div class="ok">0.30 - 0.70: acceptable</div>
            <div class="good">0.50 - 0.60: ideal</div>
            <div class="warnlight">&gt; 0.70: easy item</div>
          </td>
        </tr>
        <tr>
          <td>D-Index</td>
          <td class="text-wrap text-body2">
            The item's discrimination index, which can be between -1 and +1. It corresponds to the
            difference between: Px (proportion of success for the item among the 27% of individuals
            whose results are the highest on the entire test) – Py (proportion of success among 27%
            of individuals with the lowest overall scores).
          </td>
          <td>
            <div class="bad">&lt; 0 (negative values): anomaly of the item</div>
            <div>
              The higher the value of D-index is close to +1, the stronger the discriminating power
              of the item.
            </div>
            <div class="good">&gt; at 0.30 is desirable</div>
          </td>
        </tr>
        <tr>
          <td>Reliability if the question is removed</td>
          <td class="text-wrap">
            The new value of Cronbach's alpha if the question is removed from the exam. The
            elimination of less-reliable items should be based not only on a statistical basis but
            also on a theoretical and logical basis.
          </td>
          <td class="text-wrap">
            The higher the index and the higher the reference value, the more the removal of the
            question would improve the reliability of the exam
          </td>
        </tr>
        <tr>
          <td>Distraction Index</td>
          <td class="text-wrap">
            Indicates the effectiveness of the distractors. If the distractor is selected by less
            than 5% of respondents, it is considered non-functional. The distraction index is
            calculated on the the number of non-functional distractors (NFD) for each item.
          </td>
          <td>
            <div>Example for a question including 4 distractors:</div>
            <div>4 NFD: 0%</div>
            <div>3 NFD: 25%</div>
            <div>2 NFD: 50%</div>
            <div>1 NFD: 75%</div>
            <div>0 NFD: 100%</div>
          </td>
        </tr>
      </tbody>
    </q-markup-table>

    <q-markup-table dense flat class="text-center my-table my-table-minwidth">
      <thead>
        <tr>
          <th></th>
          <th>P-index</th>
          <th>StdDev</th>
          <th>D-index</th>
          <th>Reliability if removed</th>
          <th>Distraction Index</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(value, qid) in enableQuestions" :key="qid">
          <td>
            <label>
              {{ qid }}
              <input v-model="enableQuestions[qid]" type="checkbox" />
            </label>
          </td>
          <td :class="questionAnalytics[qid].pIndexCls">
            {{ questionAnalytics[qid].pIndex }}
          </td>
          <td>{{ questionAnalytics[qid].stdDev }}</td>
          <td :class="questionAnalytics[qid].dIndexCls">
            {{ questionAnalytics[qid].dIndex }}
          </td>
          <td :class="questionAnalytics[qid].alphaDeltaCls">
            {{ questionAnalytics[qid].alphaIfRemoved }} ({{ questionAnalytics[qid].alphaDelta }})
          </td>
          <td :class="questionAnalytics[qid].distractionIndexCls">
            {{ questionAnalytics[qid].distractionIndex }}
          </td>
        </tr>
      </tbody>
    </q-markup-table>
  </div>
</template>
<script setup lang="ts">
import { inject, computed, reactive } from 'vue';
import GradeService from '../../services/grade';
import { CronbachAlpha, ShapiroWilkW } from '../../utils/stats';
import { defineAsyncComponent } from 'vue';

const Histogram = defineAsyncComponent(() => import('@/components/Grade/Histogram.vue'));

const gradeService = inject('gradeService') as GradeService;

const enableQuestions = reactive(
  Object.keys(gradeService.grade.questions).reduce(
    (enabledQuestions, questionId) => {
      enabledQuestions[questionId] = true;
      return enabledQuestions;
    },
    {} as Record<string, boolean>
  )
);

function cronbachAlphaFiltered(questionToRemove = '') {
  const questionIds = Object.keys(enableQuestions).filter(
    (qid) => enableQuestions[qid] && qid !== questionToRemove
  );
  return CronbachAlpha(
    questionIds.map((questionId) => {
      return Object.values(gradeService.grade.scores).map((student) => {
        return student.questions[questionId];
      });
    })
  );
}

// cronbachAlpha
const cronbachAlphaAll = computed(() => {
  return cronbachAlphaFiltered();
});
const cronbachAlphaAllCls = computed(() => {
  if (cronbachAlphaAll.value < 0.5) {
    return 'bad';
  }
  if (cronbachAlphaAll.value < 0.6) {
    return 'warn';
  }
  if (cronbachAlphaAll.value < 0.7) {
    return 'warnlight';
  }
  if (cronbachAlphaAll.value < 0.8) {
    return 'ok';
  }
  return 'good';
});

const ShapiroWilkWAll = computed(() => {
  return ShapiroWilkW(Object.values(gradeService.grade.scores).map((student) => student.total));
});

const ShapiroWilkWAllCls = computed(() => {
  if (ShapiroWilkWAll.value.accept_null === 1) {
    if (ShapiroWilkWAll.value.pvalue < 0.05) {
      return 'ok';
    }
    return 'good';
  }
  if (ShapiroWilkWAll.value.pvalue > 0.05) {
    return 'warn';
  } else {
    return 'bad';
  }
});

function nbCorrectFor(questionId: string, scores: any[]) {
  return scores.reduce((totalCorrect, studentData) => {
    if (studentData.questions[questionId] === gradeService.grade.questions[questionId].max) {
      totalCorrect++;
    }
    return totalCorrect;
  }, 0);
}

const questionAnalytics = computed(() => {
  const statsIndex = gradeService.grade.stats.reduce(
    (stats, stat) => {
      stats[stat.title] = stat;
      return stats;
    },
    {} as Record<string, any>
  );

  const sortedScores = Object.values(gradeService.grade.scores).sort((a, b) => b.total - a.total);
  const nbStudents = Object.keys(gradeService.grade.scores).length;
  const nb27 = Math.floor(nbStudents * 0.27);
  const scoresTop27 = sortedScores.slice(0, nb27);
  const scoresBottom27 = sortedScores.slice(-nb27);

  return Object.keys(gradeService.grade.questions).reduce(
    (stats, qid) => {
      const nbCorrect = nbCorrectFor(qid, sortedScores);
      const pCorrectTop = nbCorrectFor(qid, scoresTop27) / nb27;
      const pCorrectBottom = nbCorrectFor(qid, scoresBottom27) / nb27;
      const alphaIfRemoved = cronbachAlphaFiltered(qid);
      const alphaDelta = alphaIfRemoved - cronbachAlphaAll.value;
      const mean =
        Object.values(gradeService.grade.scores).reduce(
          (sum, student) => sum + student.questions[qid],
          0
        ) / nbStudents;
      const stdDev = Math.sqrt(
        Object.values(gradeService.grade.scores).reduce(
          (sum, student) => sum + Math.pow(student.questions[qid] - mean, 2),
          0
        ) / nbStudents
      );

      const pIndex = nbCorrect / nbStudents;
      const dIndex = pCorrectTop - pCorrectBottom;
      // stats data -> indice de distraction (item < 5%) 100-(100/total_distracteur *distracteur<5%)é
      const totalDistractors = statsIndex[qid]?.answers.filter((a: any) => !a.correct).length;
      const nonFunctionalDistractors = statsIndex[qid]?.answers.filter(
        (a: any) => !a.correct && a.nb / statsIndex[qid].total < 0.05
      ).length;
      const distractionIndex = 1 - (1 / totalDistractors) * nonFunctionalDistractors;
      stats[qid] = {
        pIndex: pIndex.toFixed(2),
        pIndexCls:
          pIndex < 0.3
            ? 'warn'
            : pIndex < 0.5
              ? 'ok'
              : pIndex < 0.6
                ? 'good'
                : pIndex < 0.7
                  ? 'ok'
                  : pIndex < 0.99
                    ? 'warnlight'
                    : 'bad',
        stdDev: stdDev.toFixed(2),
        dIndex: dIndex.toFixed(2),
        dIndexCls:
          dIndex < 0
            ? 'bad'
            : dIndex < 0.15
              ? 'warn'
              : dIndex < 0.3
                ? 'warnlight'
                : dIndex < 0.4
                  ? 'ok'
                  : 'good',
        alphaIfRemoved: alphaIfRemoved.toFixed(3),
        alphaDelta: alphaDelta.toFixed(3),
        alphaDeltaCls:
          alphaDelta < -0.1 ? 'bad' : alphaDelta < 0 ? 'warn' : alphaDelta > 0.1 ? 'good' : 'ok',
        distractionIndex: `${Math.round(distractionIndex * 100)}%`,
        distractionIndexCls:
          distractionIndex < 0.05
            ? 'bad'
            : distractionIndex < 0.3
              ? 'warn'
              : distractionIndex > 0.7
                ? 'good'
                : ''
      };
      return stats;
    },
    {} as Record<string, any>
  );
});
</script>
<style scoped>
.my-table-minwidth td {
  min-width: 120px;
}

.my-table-dense td {
  font-size: 0.8rem !important;
}

.text-wrap {
  white-space: normal !important;
}

.bad {
  background-color: #ff572299;
}

.good {
  background-color: #21ba4599;
}

.ok {
  background-color: #90ee9099;
}

.warn {
  background-color: #f2c03799;
}

.warnlight {
  background-color: #ffeb3b99;
}
</style>
