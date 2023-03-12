<template>
  <div>
    <h2>Statistiques globales</h2>
    /* moyenne ecart-type score médian min/max score nb étudiant nb questions
    histogram */ cronbachAlpha: {{ cronbachAlphaAll }} > 0.7 ?
    <pre>
      Cronbachs Alpha	Interpretation
&gt; 0,9	Excellent
&gt; 0,8	Good
&gt; 0,7	Acceptable
&gt; 0,6	Questionable
&gt; 0,5	Poor
&lt; 0,5	Unacceptable

      {{ ShapiroWilkWAll }}

      W({{ ShapiroWilkWAll.n }}) = {{ ShapiroWilkWAll.w.toFixed(2) }}, p = {{
        ShapiroWilkWAll.pvalue.toFixed(3)
      }}
    </pre>

    <p v-if="ShapiroWilkWAll.accept_null">
      Accept Null Hypothesis as calculated W is greater than the critical value
      of W.
      <span v-if="ShapiroWilkWAll.pvalue < 0.05"
        >The p-value is less than 0.05 though.</span
      >
    </p>
    <p v-else>
      Reject Null Hypothesis as calculated W is less than the critical value of
      W.
      <span v-if="ShapiroWilkWAll.pvalue > 0.05"
        >The p-value exceeds 0.05 though.</span
      >
    </p>

    <h2>Analyse par question</h2>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>P-index</th>
          <th>StdDev</th>
          <th>D-index</th>
          <th>Fiabilité si la question est supprimée</th>
          <th>Indice de distraction</th>
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
            {{ questionAnalytics[qid].alphaIfRemoved }} ({{
              questionAnalytics[qid].alphaDelta
            }})
          </td>
          <td :class="questionAnalytics[qid].distractionIndexCls">
            {{ questionAnalytics[qid].distractionIndex }}
          </td>
        </tr>
      </tbody>
    </table>

    P-index: Il s'agit de l'indice de difficulté de l'item. Il correspond au
    ratio des répondant·e·s qui répondent correctement à l'item, soit : Ri
    (nombre des répondant·e·s qui répondent à l'item correctement) / Ni (nombre
    total de répondant·e·s). &lt; 0.30 : item difficile • 0.30 - 0.70 :
    acceptable • 0.50 - 0.60 : idéal • &gt; 0.70 : item facile D-Index Il s'agit
    de l'indice de discrimination de l'item qui peut se situer entre -1 et +1.
    Il correspond à la différence entre : Px (proportion de réussite à l'item
    parmi les 27% d'individus dont les résultats sont les plus élevés sur
    l'ensemble de l'épreuve) – Py (proportion de réussite chez les 27%
    d'individus dont les résultats globaux sont les plus faibles). &lt; 0
    (valeurs négatives) : anomalie de l'item • Plus la valeur de D-index est
    proche de +1, plus le pouvoir discriminant de l'item est fort • Un indice
    &gt; à 0,30 est souhaitable Fiabilité si la question est supprimée Indique
    la nouvelle valeur de l'alpha de Cronbach si la question est retirée de
    l'examen. Plus l'indice est élevé et supérieur à la valeur de référence,
    plus la suppression de la question améliorerait la fiabilité de l'examen
    Indice de distraction Indique l'efficacité des distracteurs. Si le
    distracteur est sélectionné par moins de 5% des répondant·e·s, il est
    considéré comme non fonctionnel. L'indice de distraction est calculé sur la
    base du nombre de distracteurs non fonctionnels (DNF) pour chaque item.
    Exemple pour un question comprenant 4 distracteurs : • 4 DNF : 0% • 3 DNF :
    25% • 2 DNF : 50% • 1 DNF : 75% • 0 DNF : 100%
  </div>
</template>
<script lang="ts" setup>
import { inject, computed, reactive } from 'vue';
import GradeService from '../../services/grade';
import { CronbachAlpha, ShapiroWilkW } from '../../utils/stats';
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

const ShapiroWilkWAll = computed(() => {
  return ShapiroWilkW(
    Object.values(gradeService.grade.scores).map((student) => student.total)
  );
});

function nbCorrectFor(questionId: string, scores: any[]) {
  return scores.reduce((totalCorrect, studentData) => {
    if (
      studentData.questions[questionId] ===
      gradeService.grade.questions[questionId].max
    ) {
      totalCorrect++;
    }
    return totalCorrect;
  }, 0);
}

const questionAnalytics = computed(() => {
  const statsIndex = gradeService.grade.stats.reduce((stats, stat) => {
    stats[stat.title] = stat;
    return stats;
  }, {} as Record<string, any>);

  const sortedScores = Object.values(gradeService.grade.scores).sort(
    (a, b) => b.total - a.total
  );
  const nbStudents = Object.keys(gradeService.grade.scores).length;
  const nb27 = Math.floor(nbStudents * 0.27);
  const scoresTop27 = sortedScores.slice(0, nb27);
  const scoresBottom27 = sortedScores.slice(-nb27);

  return Object.keys(gradeService.grade.questions).reduce((stats, qid) => {
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
    const totalDistractors = statsIndex[qid]?.answers.filter(
      (a: any) => !a.correct
    ).length;
    const nonFunctionalDistractors = statsIndex[qid]?.answers.filter(
      (a: any) => !a.correct && a.nb / statsIndex[qid].total < 0.05
    ).length;
    const distractionIndex =
      1 - (1 / totalDistractors) * nonFunctionalDistractors;
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
        alphaDelta < -0.1
          ? 'bad'
          : alphaDelta < 0
          ? 'warn'
          : alphaDelta > 0.1
          ? 'good'
          : 'ok',
      distractionIndex: `${Math.round(distractionIndex * 100)}%`,
      distractionIndexCls:
        distractionIndex < 0.05
          ? 'bad'
          : distractionIndex < 0.3
          ? 'warn'
          : distractionIndex > 0.7
          ? 'good'
          : '',
    };
    return stats;
  }, {} as Record<string, any>);
});
</script>
<style scoped>
.bad {
  background-color: red;
}
.good {
  background-color: green;
}
.ok {
  background-color: lightgreen;
}
.warn {
  background-color: orange;
}
.warnlight {
  background-color: lightyellow;
}
</style>
