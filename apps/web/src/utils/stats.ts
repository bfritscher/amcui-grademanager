export function CronbachAlpha(listOfQuestions: number[][]) {
  // list of questions and their answers
  if (listOfQuestions.length < 2) {
    return -1;
  }
  const numQuestions = listOfQuestions.length;
  const numIndividuals = listOfQuestions[0].length;
  let sumVariance = 0;
  for (const individualScores of listOfQuestions) {
    const sumScores = individualScores.reduce((sum, score) => {
      return sum + score;
    }, 0);
    const itemsMean = sumScores / individualScores.length;
    const itemsVariance =
      individualScores.reduce((sum, score) => sum + Math.pow(score - itemsMean, 2), 0) /
      (individualScores.length - 1);
    sumVariance += itemsVariance;
  }
  const totalScores = listOfQuestions[0].map((_, i) => {
    return listOfQuestions.reduce((sum, individualScores) => sum + individualScores[i], 0);
  });
  const totalMean = totalScores.reduce((sum, score) => sum + score, 0) / numIndividuals;
  const totalVariance =
    totalScores.reduce((sum, score) => {
      return sum + Math.pow(score - totalMean, 2);
    }, 0) /
    (numIndividuals - 1);
  const alpha =
    ((numQuestions / (numQuestions - 1)) * (totalVariance - sumVariance)) / totalVariance;

  return alpha;
}

/*
Cronbachs Alpha	Interpretation
> 0,9	Excellent
> 0,8	Good
> 0,7	Acceptable
> 0,6	Questionable
> 0,5	Poor
< 0,5	Unacceptable
*/

// https://scistatcalc.blogspot.com/2013/10/shapiro-wilk-test-calculator.html
export function ShapiroWilkW(X: number[]) {
  const Xlen = X.length;

  let mu = 0;

  for (let k = 0; k < Xlen; k++) mu = mu + Number(X[k]);

  mu = mu / Xlen;

  let sumsq = 0;

  for (let k = 0; k < Xlen; k++) sumsq = sumsq + (Number(X[k]) - mu) * (Number(X[k]) - mu);

  let std2 = (1.0 / (Xlen - 1)) * sumsq;

  if (Xlen == 1) std2 = 0;

  const std = Math.sqrt(std2);

  let sum_q = 0;

  for (let k = 0; k < Xlen; k++) {
    sum_q = sum_q + Math.pow(Number(X[k]) - mu, 4.0);
  }

  const kurt = (1.0 / Xlen) * Math.pow(std, -4.0) * sum_q - 3;

  const xs = [];

  for (let k = 0; k < Xlen; k++) xs[k] = Number(X[k]);

  // Sorted data samples
  xs.sort(compare);

  const m = [];

  for (let k = 0; k < Xlen; k++) m[k] = gauss_icdf((k + 1 - 3 / 8) / (Xlen + 0.25), 0, 1);

  let msq = 0;

  for (let k = 0; k < Xlen; k++) msq = msq + m[k] * m[k];

  const w = [];

  for (let k = 0; k < Xlen; k++) w[k] = m[k] / Math.sqrt(msq);

  let wx = 0;

  for (let k = 0; k < Xlen; k++) wx = wx + w[k] * xs[k];

  const Wfr = (wx * wx) / sumsq;

  let c = [];

  c = w;

  const u = 1 / Math.sqrt(Xlen);

  const p1 = [];

  p1[0] = -2.706056;
  p1[1] = 4.434685;
  p1[2] = -2.07119;
  p1[3] = -0.147981;
  p1[4] = 0.221157;
  p1[5] = c[Xlen - 1];

  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u2 * u2;
  const u5 = u3 * u2;

  const p2 = [];

  p2[0] = -3.582633;
  p2[1] = 5.682633;
  p2[2] = -1.752461;
  p2[3] = -0.293762;
  p2[4] = 0.042981;
  p2[5] = c[Xlen - 2];

  w[Xlen - 1] = p1[0] * u5 + p1[1] * u4 + p1[2] * u3 + p1[3] * u2 + p1[4] * u + p1[5];

  w[0] = -w[Xlen - 1];

  if (Xlen == 3) {
    w[0] = Math.sqrt(0.5);
    w[2] = -w[0];
  }

  let ct = 0;
  let phi = 0;

  let numerator = 1;
  let denominator = 1;

  if (Xlen >= 6) {
    w[Xlen - 2] = p2[0] * u5 + p2[1] * u4 + p2[2] * u3 + p2[3] * u2 + p2[4] * u + p2[5];
    w[1] = -w[Xlen - 2];
    ct = 3;

    numerator = msq - 2 * m[Xlen - 1] * m[Xlen - 1] - 2 * m[Xlen - 2] * m[Xlen - 2];
    denominator = 1 - 2 * w[Xlen - 1] * w[Xlen - 1] - 2 * w[Xlen - 2] * w[Xlen - 2];
    phi = numerator / denominator;
  } else {
    ct = 2;
    numerator = msq - 2 * m[Xlen - 1] * m[Xlen - 1];
    denominator = 1 - 2 * w[Xlen - 1] * w[Xlen - 1];
    phi = numerator / denominator;
  }

  if (Xlen != 3) {
    for (let k = ct - 1; k < Xlen - ct + 1; k++) w[k] = m[k] / Math.sqrt(phi);
  }

  wx = 0;

  let Wsw = 0;

  for (let k = 0; k < Xlen; k++) wx = wx + w[k] * xs[k];

  Wsw = (wx * wx) / sumsq;

  let Wfinal = 0;

  if (kurt > 3) Wfinal = Wfr;
  else Wfinal = Wsw;

  // let Wc = find_critical(Xlen)
  const Wc = calc_critical(Xlen);

  let accept_null = 0;

  // Calculate p value
  let pw = 0;

  const N = Xlen;

  const pi6 = 6 / Math.PI;

  const G = [-0.2273e1, 0.459];
  const c3 = [0.544, -0.39978, 0.25054e-1, -0.6714e-3];
  const c4 = [0.13822e1, -0.77857, 0.62767e-1, -0.20322e-2];

  const c5 = [-0.15861e1, -0.31082, -0.83751e-1, 0.38915e-2];
  const c6 = [-0.4803, -0.82676e-1, 0.30302e-2];

  const stqr = Math.PI / 3;

  let y = Math.log(1 - Wfinal);
  const xx = Math.log(N);
  let mm = 0;
  let s = 1;

  if (N == 3) {
    pw = pi6 * (Math.asin(Math.min(Math.sqrt(Wfinal), 1)) - stqr);

    if (pw < 0) pw = 0;
    else if (pw > 1) pw = 1;
  } else if (N <= 11) {
    const gma = G[1] * N + G[0] * 1;

    if (y > gma) pw = 1e-19;
    else {
      y = -Math.log(gma - y);
      mm = c3[3] * N * N * N + c3[2] * N * N + c3[1] * N + c3[0];
      s = Math.exp(c4[3] * N * N * N + c4[2] * N * N + c4[1] * N + c4[0]);
      pw = 1 - gauss_cdf((y - mm) / s, 0, 1);
    }
  } else {
    mm = c5[3] * xx * xx * xx + c5[2] * xx * xx + c5[1] * xx + c5[0];
    s = Math.exp(c6[2] * xx * xx + c6[1] * xx + c6[0]);
    pw = 1 - gauss_cdf((y - mm) / s, 0, 1);
  }

  if (Wfinal >= Wc) {
    /*
    if (pw >= 0.05) {
      document.getElementById('p1').innerHTML =
        'Accept Null Hypothesis as calculated W is greater than the critical value of W.';
    } else {
      document.getElementById('p1').innerHTML =
        'Accept Null Hypothesis as calculated W is greater than the critical value of W. The p-value is less than 0.05 though.';
    }
    */

    accept_null = 1;
  } else {
    accept_null = 0;
    /*
    document.getElementById('p1').innerHTML =
      'Reject Null Hypothesis as calculated W is less than the critical value of W.';


    if (pw <= 0.05) {
      document.getElementById('p1').innerHTML =
        'Reject Null Hypothesis as calculated W is less than the critical value of W.';
    } else {
      document.getElementById('p1').innerHTML =
        'Reject Null Hypothesis as calculated W is less than the critical value of W. The p-value exceeds 0.05 though.';
    }
    */
  }
  const midpoint = Math.floor(xs.length / 2); // 2.
  const median =
    xs.length % 2 === 1
      ? xs[midpoint] // 3.1. If odd length, just take midpoint
      : (xs[midpoint - 1] + xs[midpoint]) / 2; // 3.2. If even length, take median of midpoints
  return {
    n: Xlen,
    mean: mu,
    median,
    min: Math.min(...xs),
    max: Math.max(...xs),
    std: std,
    var: std2,
    kurt: kurt,
    w: Wfinal,
    pvalue: pw,
    wcrit: Wc,
    accept_null
  };
}

function gauss_cdf(inp: number, mu: number, sig: number): number {
  let res = erf_taylor((inp - mu) / Math.sqrt(2 * sig * sig));
  res = 0.5 * (1 + res);
  return res;
}

function gauss_icdf(p: number, mu: number, sig: number): number {
  return inverf(2 * p - 1) * sig * Math.sqrt(2.0) + mu;
}

function inverf(x: number): number {
  let w;
  let p;
  w = -1 * Math.log((1.0 - x) * (1.0 + x));

  if (w < 5.0) {
    w = w - 2.5;
    p = 2.81022636e-8;
    p = 3.43273939e-7 + p * w;
    p = -3.5233877e-6 + p * w;
    p = -4.39150654e-6 + p * w;
    p = 0.00021858087 + p * w;
    p = -0.00125372503 + p * w;
    p = -0.00417768164 + p * w;
    p = 0.246640727 + p * w;
    p = 1.50140941 + p * w;
  } else {
    w = Math.sqrt(w) - 3.0;
    p = -0.000200214257;
    p = 0.000100950558 + p * w;
    p = 0.00134934322 + p * w;
    p = -0.00367342844 + p * w;
    p = 0.00573950773 + p * w;
    p = -0.0076224613 + p * w;
    p = 0.00943887047 + p * w;
    p = 1.00167406 + p * w;
    p = 2.83297682 + p * w;
  }

  const res_ra = p * x;
  let res_hm = 0;
  const fx = erf_taylor(res_ra) - x;
  const df = (2.0 / Math.sqrt(Math.PI)) * Math.exp(-(res_ra * res_ra));
  const d2f = -2 * res_ra * df;

  res_hm = res_ra - (2 * fx * df) / (2 * df * df - fx * d2f);

  if (x == 0) res_hm = 0;

  return res_hm;
}

function erf_taylor(x: number): number {
  let res = 0;

  const c = 2.0 / Math.sqrt(Math.PI);

  for (let n = 0; n < 100; n++)
    res = res + (Math.pow(-1, n) * Math.pow(x, 2 * n + 1)) / (sFact(n) * (2 * n + 1));

  res = c * res;

  // Fudge to resolve stability issues..
  if (x >= 5.74) res = 1.0;
  if (x <= -5.74) res = -1.0;

  return res;
}

function calc_critical(nsamp: number) {
  let res = 0.0;
  const pw = 0.05;

  const pi6 = 6 / Math.PI;

  const N = nsamp;

  const G = [-0.2273e1, 0.459];
  const c3 = [0.544, -0.39978, 0.25054e-1, -0.6714e-3];
  const c4 = [0.13822e1, -0.77857, 0.62767e-1, -0.20322e-2];

  const c5 = [-0.15861e1, -0.31082, -0.83751e-1, 0.38915e-2];
  const c6 = [-0.4803, -0.82676e-1, 0.30302e-2];

  const stqr = Math.PI / 3;

  const xx = Math.log(N);
  let m = 0;
  let s = 1;

  if (N == 3) {
    res = Math.sin(pw / pi6 + stqr) ^ 2;
  } else if (N <= 11) {
    const gma = G[1] * N + G[0] * 1;
    m = c3[3] * N * N * N + c3[2] * N * N + c3[1] * N + c3[0];
    s = Math.exp(c4[3] * N * N * N + c4[2] * N * N + c4[1] * N + c4[0]);

    const yms = gauss_icdf(1 - pw, 0, 1);

    const y0 = s * yms + m;
    const y1 = gma - Math.exp(-y0);
    res = 1 - Math.exp(y1);
  } else {
    m = c5[3] * xx * xx * xx + c5[2] * xx * xx + c5[1] * xx + c5[0];
    s = Math.exp(c6[2] * xx * xx + c6[1] * xx + c6[0]);

    const yms = gauss_icdf(1 - pw, 0, 1);
    const y0 = s * yms + m;
    res = 1 - Math.exp(y0);
  }
  return res;
}

function sFact(num: number): number {
  let rval = 1;
  for (let i = 2; i <= num; i++) rval = rval * i;
  return rval;
}

function compare(a: number, b: number) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
