/**
 * Loft Section Generator - 核心計算邏輯（後端用）
 * 基於原始 HTML 版本的精確實現
 */

// ═══════════════════════════════════════════════════════════════════════════
// 工具函數
// ═══════════════════════════════════════════════════════════════════════════

export function fmt(v: number, decimals: number = 8): string {
  return parseFloat(v.toFixed(decimals)).toString();
}

// export function fmtChk(v: number): string {
//   return parseFloat(v.toFixed(1)).toString();
// }

export function fmtR(v: number): string {
  return parseFloat(v.toFixed(3)).toString();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 超橢圓參數估計
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 根據圓角矩形尺寸估計 Lamé 曲線參數 n
 */
export function estimateN(a: number, b: number, R: number): number {
  const half = Math.min(a, b);
  if (R <= 0) return 20;
  if (R >= half) return 2;
  let best = 4, bestErr = Infinity;
  for (let n = 2; n <= 30; n += 0.05) {
    const c = Math.SQRT2 / 2;
    const r45 = 1.0 / Math.pow(Math.pow(c / a, n) + Math.pow(c / b, n), 1 / n);
    const err = Math.abs(half - r45 * c - R);
    if (err < bestErr) { bestErr = err; best = n; }
  }
  return Math.round(best * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 精確圓角矩形極徑
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 計算給定角度 theta 下，圓角矩形的極坐標半徑
 * 這是完全精確的，與邊界交點會完美對齐
 */
function rRoundedRect(a: number, b: number, Rc: number, theta: number): number {
  // Rc=0：純矩形，直接返回到邊的距離
  if (Rc <= 0) {
    const ax = Math.abs(Math.cos(theta));
    const ay = Math.abs(Math.sin(theta));
    let r = Infinity;
    if (ax > 1e-12) r = Math.min(r, a / ax);
    if (ay > 1e-12) r = Math.min(r, b / ay);
    return r;
  }

  const ax = Math.abs(Math.cos(theta));
  const ay = Math.abs(Math.sin(theta));
  // 與矩形邊的交點距離
  let r = Infinity;
  if (ax > 1e-12) r = Math.min(r, a / ax);
  if (ay > 1e-12) r = Math.min(r, b / ay);

  // 判斷交點是否落在直線段（非圓角區域）
  // 直線段 x 範圍：[0, a-Rc]，y 範圍：[0, b-Rc]
  const ix = r * ax, iy = r * ay;
  if (ix <= a - Rc + 1e-9 || iy <= b - Rc + 1e-9) return r;

  // 落在圓角區：求射線與圓弧交點
  // 圓心在 (a-Rc, b-Rc)，半徑 Rc
  const cx = a - Rc, cy = b - Rc;
  const B = cx * ax + cy * ay;
  const C = cx * cx + cy * cy - Rc * Rc;
  const disc = B * B - C;
  return disc < 0 ? r : B + Math.sqrt(Math.max(0, disc));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 圓角矩形生成
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 構建帶圓角的矩形曲線
 */
export function buildRoundedRect(
  W: number,
  H: number,
  R: number,
  N: number
): Array<[number, number]> {
  const a = W / 2, b = H / 2;
  // 圓角半徑上限：min(a,b)，超出就夾住
  const Rc = Math.min(Math.max(0, R), Math.min(a, b));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI;
    const r = rRoundedRect(a, b, Rc, theta);
    pts.push([r * Math.cos(theta), r * Math.sin(theta)]);
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 插值函數
// ═══════════════════════════════════════════════════════════════════════════

function easeK(k: number, mode: string): number {
  switch (mode) {
    case 'cosine':       return (1 - Math.cos(k * Math.PI)) / 2;
    case 'smoothstep':   return k * k * (3 - 2 * k);
    case 'smootherstep': return k * k * k * (k * (k * 6 - 15) + 10);
    default:             return k;
  }
}

/**
 * 根據插值參數生成過渡曲線
 */
export function buildInterp(
  rectPts: Array<[number, number]>,
  CR: number,
  k: number,
  N: number,
  interpMode: string
): Array<[number, number]> {
  const ke = easeK(k, interpMode);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = rectPts[i];
    const r0 = Math.sqrt(x * x + y * y);
    const theta = Math.atan2(y, x);
    const r = (1 - ke) * r0 + ke * CR;
    pts.push([r * Math.cos(theta), r * Math.sin(theta)]);
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 顏色漸層
// ═══════════════════════════════════════════════════════════════════════════

export function lerpColor(t: number): string {
  const stops = [[37, 99, 235], [5, 150, 105], [220, 38, 38]];
  const s = t * (stops.length - 1);
  const i = Math.min(Math.floor(s), stops.length - 2);
  const f = s - i;
  const c = stops[i].map((v, j) => Math.round(v + f * (stops[i + 1][j] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. 方程式生成
// ═══════════════════════════════════════════════════════════════════════════

export interface EquationData {
  k: number;
  label: string;
  equation: string;
  iblData: string;
  fileName: string;
  color: string;
  checkData: {
    startPt: [number, number];
    quarterPt: [number, number];
    closureErr: number;
  };
}

export function generateEquation(
  k: number,
  idx: number,
  total: number,
  W: number,
  H: number,
  R: number,
  CR: number,
  n: number,
  pts: Array<[number, number]>,
  rectPts: Array<[number, number]>,
  NP: number,
  color: string
): EquationData {
  const isRect = idx === 0;
  const isCirc = idx === total - 1;

  const n_s = fmt(n);
  const inv_n = fmt(1 / n);
  const a_s = fmt(W / 2);
  const b_s = fmt(H / 2);
  const CR_s = fmt(CR);
  const k1_s = fmt(1 - k);
  const k_s = fmt(k);

  const core = `pow(pow(abs(cos(t*360))/${a_s},${n_s})+pow(abs(sin(t*360))/${b_s},${n_s}),${inv_n})`;
  let r_expr: string;
  if (isRect) r_expr = `1/${core}`;
  else if (isCirc) r_expr = CR_s;
  else r_expr = `${k1_s}/${core}+${k_s}*${CR_s}`;

  const equation = `x = (${r_expr})*cos(t*360)\ny = (${r_expr})*sin(t*360)\nz = 0`;

  // IBL Data
  const iblData = pts
    .map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)} 0.000000`)
    .join('\n');

  // File name
  const safe = (s: string | number) => String(s).replace(/\./g, '_');
  const fileName = `loft_k${safe(fmt(k, 3))}_W${safe(W)}_H${safe(H)}_R${safe(R)}_CR${safe(fmtR(CR))}.ibl`;

  // Check data
  const check0 = rectPts[0];
  const checkQ = rectPts[Math.floor(NP / 4)];
  const closureErr = Math.hypot(
    pts[0][0] - pts[pts.length - 1][0],
    pts[0][1] - pts[pts.length - 1][1]
  );

  const label = isRect
    ? `圓角矩形端 (k=0)`
    : isCirc
      ? `圓形端 (k=1)`
      : `過渡 ${idx}  k=${fmt(k, 3)}`;

  return {
    k,
    label,
    equation,
    iblData,
    fileName,
    color,
    checkData: {
      startPt: check0,
      quarterPt: checkQ,
      closureErr,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. 主生成函數
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerateInput {
  W: number;
  H: number;
  R: number;
  D: number;
  NUM: number;
  NP: number;
  interpMode: string;
}

export interface GenerateOutput {
  curves: Array<{
    pts: Array<[number, number]>;
    label: string;
    color: string;
    isDashed: boolean;
  }>;
  equations: EquationData[];
  state: {
    W: number;
    H: number;
    R: number;
    CR: number;
    n: number;
    a: number;
    b: number;
    kVals: number[];
    NP: number;
  };
}

export function generate(input: GenerateInput): GenerateOutput {
  const { W, H, R, D, NUM, NP, interpMode } = input;
  const CR = D / 2;
  const a = W / 2;
  const b = H / 2;
  const n = estimateN(a, b, Math.min(R, Math.min(a, b) * 0.499));

  const total = NUM + 2;
  const kVals = Array.from({ length: total }, (_, i) => i / (total - 1));
  const rectPts = buildRoundedRect(W, H, R, NP);

  const curves = kVals.map((k, idx) => {
    const isRect = idx === 0;
    const isCirc = idx === total - 1;

    let pts: Array<[number, number]>;
    if (isRect) {
      pts = rectPts;
    } else if (isCirc) {
      pts = Array.from({ length: NP + 1 }, (_, i) => {
        const ang = (i / NP) * 2 * Math.PI;
        return [CR * Math.cos(ang), CR * Math.sin(ang)];
      });
    } else {
      pts = buildInterp(rectPts, CR, k, NP, interpMode);
    }

    const label = isRect
      ? `圓角矩形  W=${W} H=${H} R=${R}`
      : isCirc
        ? `圓形  D=${D}（R=${fmtR(CR)}）`
        : `過渡 ${idx}  k=${fmt(k, 3)}`;

    return {
      pts,
      label,
      color: lerpColor(idx / (total - 1)),
      isDashed: !isRect && !isCirc,
    };
  });

  const equations = kVals.map((k, idx) => {
    return generateEquation(
      k,
      idx,
      total,
      W,
      H,
      R,
      CR,
      n,
      curves[idx].pts,
      rectPts,
      NP,
      curves[idx].color
    );
  });

  return {
    curves,
    equations,
    state: {
      W,
      H,
      R,
      CR,
      n,
      a,
      b,
      kVals,
      NP,
    },
  };
}
