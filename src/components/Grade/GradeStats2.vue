<template>
  <div class="row">
    <pre>
    {{ questionAnalytics }}
  </pre>
    <div>
      <label v-for="(value, qid) in enabledQuestions" :key="qid">
        {{ qid }}
        <input v-model="enabledQuestions[qid]" type="checkbox" />
      </label>
    </div>
    cronbachAlpha: {{ cronbachAlphaAll }} > 0.7 ?
  </div>
</template>
<script lang="ts" setup>
import { inject, computed, reactive } from 'vue';
import GradeService from '../../services/grade';
import { cronbachAlpha } from '../../utils/stats';
const gradeService = inject('gradeService') as GradeService;

const enabledQuestions = reactive(
  Object.keys(gradeService.grade.questions).reduce(
    (enabledQuestions, questionId) => {
      enabledQuestions[questionId] = true;
      return enabledQuestions;
    },
    {} as Record<string, boolean>
  )
);

function cronbachAlphaFiltered(questionToRemove='') {
  const questionIds = Object.keys(enabledQuestions).filter(
    (qid) => enabledQuestions[qid] && qid !== questionToRemove
  );
  return cronbachAlpha(
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

const sortedScores = Object.values(gradeService.grade.scores).sort(
    (a, b) => b.total - a.total
  );
const nbStudents = Object.keys(gradeService.grade.scores).length;
const nb27 = Math.floor(nbStudents * 0.27);

const questionAnalytics = computed(() => {
return Object.keys(gradeService.grade.questions).reduce((stats, qid) => {
  const nbCorrect = 0 // compute from scores for qid if score == gradeService.grade.questions[qid].max
  const pCorrectTop = 0 // nbCorrect in nb27 / nb27
  const pCorrectBottom = 0 // nbCorrect in -nb27 / nb27
  const alphaIfRemoved = cronbachAlphaFiltered(qid);
  stats[qid] = {
    pIndex: nbCorrect / nbStudents,
    alphaIfRemoved,
    alphaDelta: alphaIfRemoved - cronbachAlphaAll.value,
    dIndex: pCorrectTop - pCorrectBottom,
  };
  return stats;
}, {} as Record<string, any>);
});

// cronbachAlpha for each Q removed + delta to original

// https://www.statskingdom.com/shapiro-wilk-test-calculator.html p-value normal test?

// histogramm
//normal
// écart type
// median
/*
moyenne ecart-type
score médian
min/max score
nb étudiant
nb questions
nb échec %
*/

/*
score data -> p-index (same as stats avg?) reussie/total pour q
	     -> d-index -27% +27% (proportion de réussite à l'item parmi les 27% d’individus
dont les résultats sont les plus élevés sur l'ensemble de
l'épreuve) – Py (proportion de réussite chez les 27%
d’individus dont les résultats globaux sont les plus faibles).

alpha if question removed

indice de distraction
stats data -> indice de distraction (item < 5%) 100-(100/total_distracteur *distracteur<5%)
*/
</script>
<style scoped></style>
