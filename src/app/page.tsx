'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import './page.css';

interface CanvasState {
  W: number;
  H: number;
  R: number;
  CR: number;
  n: number;
  a: number;
  b: number;
  kVals: number[];
  NP: number;
}

interface EquationItem {
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

interface CurveData {
  pts: [number, number][];
  label: string;
  color: string;
  isDashed: boolean;
}

const fmtChk = (v: number): string => {
  return parseFloat(v.toFixed(1)).toString();
};

const fmtR = (v: number): string => {
  return parseFloat(v.toFixed(3)).toString();
};

export default function Home() {
  // Input states
  const [inpW, setInpW] = useState('17');
  const [inpH, setInpH] = useState('17');
  const [inpR, setInpR] = useState('3');
  const [inpD, setInpD] = useState('35');
  const [dispR, setDispR] = useState('17.5');
  const [slNum, setSlNum] = useState('4');
  const [slPts, setSlPts] = useState('1024');
  const [interpMode, setInterpMode] = useState('linear');
  const [interpDesc, setInterpDesc] = useState('均勻分佈，曲率在中段變化較快');
  const [panelNotice, setPanelNotice] = useState<{ type: string; text: string } | null>(null);
  const [highlightEqIdx, setHighlightEqIdx] = useState(-1);

  // Canvas states
  const cvRef = useRef<HTMLCanvasElement>(null);
  const cvWrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [curves, setCurves] = useState<CurveData[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [lockedIdx, setLockedIdx] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [equations, setEquations] = useState<EquationItem[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [canvasState, setCanvasState] = useState<CanvasState | null>(null);

  // Sync eq-card highlight with canvas hover
  useEffect(() => {
    if (hoveredIdx >= 0) {
      setHighlightEqIdx(hoveredIdx);
      const timer = setTimeout(() => {
        setHighlightEqIdx(-1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setHighlightEqIdx(-1);
    }
  }, [hoveredIdx]);

  // ...existing code...

  // Update radius
  useEffect(() => {
    const D = parseFloat(inpD);
    const R = isNaN(D) ? '—' : fmtR(D / 2);
    setDispR(R);
  }, [inpD]);

  // Check shape validity
  useEffect(() => {
    const W = parseFloat(inpW);
    const H = parseFloat(inpH);
    const R = parseFloat(inpR);
    const D = parseFloat(inpD);
    const maxR = Math.min(W, H) / 2;

    // Check for zero values
    if (W === 0 || H === 0 || D === 0) {
      const zeroFields = [];
      if (W === 0) zeroFields.push('寬度 (Width)');
      if (H === 0) zeroFields.push('高度 (Height)');
      if (D === 0) zeroFields.push('直徑 (Diameter)');
      setPanelNotice({
        type: 'warn',
        text: `⚠ ${zeroFields.join('、')} 不能為 0，請重新調整。`,
      });
      return;
    }

    if (isNaN(R) || W <= 0 || H <= 0) {
      setPanelNotice(null);
      return;
    }

    if (R > maxR) {
      setPanelNotice({
        type: 'warn',
        text: `⚠ 圓角半徑 R=${R} mm 超過最短邊一半（最大 ${fmtR(maxR)} mm），請重新調整。`,
      });
    } else if (W === H && Math.abs(R - maxR) < 1e-9) {
      setPanelNotice({
        type: 'info',
        text: `✦ 當前設定（W=H=${W}，R=${R}）使圓角矩形等效為圓形（半徑 ${fmtR(maxR)} mm）。`,
      });
    } else {
      setPanelNotice(null);
    }
  }, [inpW, inpH, inpR, inpD]);

  // Canvas resize listener
  useEffect(() => {
    const handleResize = () => {
      if (cvWrapRef.current) {
        const w = cvWrapRef.current.clientWidth;
        const h = cvWrapRef.current.clientHeight;
        setCanvasWidth(w);
        setCanvasHeight(h);
      }
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (cvWrapRef.current) observer.observe(cvWrapRef.current);

    return () => observer.disconnect();
  }, []);

  // Canvas helpers
  const HL = () => (canvasState ? canvasState.CR * 2 + 5 : 45);
  const sc = () => Math.min(canvasWidth, canvasHeight) / (HL() * 2);
  const w2s = (wx: number, wy: number): [number, number] => [
    canvasWidth / 2 + (panX + wx) * sc() * zoom,
    canvasHeight / 2 - (panY + wy) * sc() * zoom,
  ];
  const zoomBounds = () => ({ min: 1, max: HL() / 5 });
  const applyZoomClamp = (z: number) => {
    const { min, max } = zoomBounds();
    return Math.max(min, Math.min(max, z));
  };
  const clampPan = (x: number, y: number, z: number): [number, number] => {
    const hl = HL();
    const s = sc();
    const halfW = canvasWidth / 2 / (s * z);
    const halfH = canvasHeight / 2 / (s * z);
    const rx = Math.max(0, hl - halfW);
    const ry = Math.max(0, hl - halfH);
    return [Math.max(-rx, Math.min(rx, x)), Math.max(-ry, Math.min(ry, y))];
  };

  // Generate
  const generate = async () => {
    const W = parseFloat(inpW) || 17;
    const H = parseFloat(inpH) || 17;
    const D = parseFloat(inpD) || 35;
    const Rraw = parseFloat(inpR);
    const R = isNaN(Rraw) ? 3 : Math.max(0, Rraw);
    const NUM = parseInt(slNum) || 4;
    const NP = parseInt(slPts) || 1024;

    try {
      const response = await fetch('/api/loft/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ W, H, R, D, NUM, NP, interpMode }),
      });

      if (!response.ok) throw new Error('生成失败');
      const data = await response.json() as { curves: CurveData[]; state: CanvasState; equations: EquationItem[] };

      setCurves(data.curves);
      setCanvasState(data.state);
      setEquations(data.equations);
      setLockedIdx(-1);
      setHoveredIdx(-1);

      const newZoom = applyZoomClamp(HL() / (data.state.CR + 5));
      setZoom(newZoom);
      const [newPanX, newPanY] = clampPan(0, 0, newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    } catch (error) {
      console.error(error);
      alert('生成失败');
    }
  };


  // Redraw
  const redraw = useCallback(() => {
    if (!cvRef.current || canvasWidth === 0 || canvasHeight === 0) return;
    const ctx = cvRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const s = sc();
    const hl = HL();
    const x0w = -panX - canvasWidth / 2 / (s * zoom);
    const x1w = -panX + canvasWidth / 2 / (s * zoom);
    const y0w = -panY - canvasHeight / 2 / (s * zoom);
    const y1w = -panY + canvasHeight / 2 / (s * zoom);

    // Grid
    const GRID = 5;
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth = 0.5;
    for (let gx = Math.floor(x0w / GRID) * GRID; gx <= x1w; gx += GRID) {
      const [px] = w2s(gx, 0);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasHeight);
      ctx.stroke();
    }
    for (let gy = Math.max(-hl, Math.floor(y0w / GRID) * GRID); gy <= Math.min(hl, y1w); gy += GRID) {
      const [, py] = w2s(0, gy);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvasWidth, py);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#C0C0C0';
    ctx.lineWidth = 1;
    const [ox, oy] = w2s(0, 0);
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, canvasHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(canvasWidth, oy);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '11px DM Mono';
    for (let gx = Math.ceil(x0w / GRID) * GRID; gx <= x1w; gx += GRID) {
      if (Math.abs(gx) < 1e-9) continue;
      const [px] = w2s(gx, 0);
      if (px >= 5 && px <= canvasWidth - 5) {
        ctx.textAlign = 'center';
        ctx.fillText(gx.toString(), px, Math.max(14, Math.min(canvasHeight - 4, oy + 14)));
      }
    }
    for (let gy = Math.ceil(y0w / GRID) * GRID; gy <= y1w; gy += GRID) {
      if (Math.abs(gy) < 1e-9) continue;
      const [, py] = w2s(0, gy);
      if (py >= 5 && py <= canvasHeight - 5) {
        ctx.textAlign = 'right';
        ctx.fillText(gy.toString(), Math.max(28, Math.min(canvasWidth - 4, ox - 5)), py + 4);
      }
    }

    // Curves
    curves.forEach((curve, idx) => {
      const isActive = idx === hoveredIdx || idx === lockedIdx;
      const dimmed = (hoveredIdx >= 0 || lockedIdx >= 0) && !isActive;
      const alpha = dimmed ? 0.15 : isActive ? 1 : 0.8;
      const [r, g, b] = curve.color.match(/\d+/g)?.map(Number) || [37, 99, 235];

      ctx.beginPath();
      curve.pts.forEach((p, i) => {
        const [px, py] = w2s(p[0], p[1]);
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = isActive ? 2.5 : curve.isDashed ? 1 : 1.8;
      ctx.setLineDash(curve.isDashed && !isActive ? [5, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Center
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox - 7, oy);
    ctx.lineTo(ox + 7, oy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy - 7);
    ctx.lineTo(ox, oy + 7);
    ctx.stroke();
  }, [curves, canvasWidth, canvasHeight, panX, panY, zoom, hoveredIdx, lockedIdx, w2s, HL, sc]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = cvRef.current?.getBoundingClientRect();
    if (!rect) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setPanStart({ x: panX, y: panY });
    if (cvRef.current) cvRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = cvRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const s = sc();
      const [px, py] = clampPan(panStart.x + (x - dragStart.x) / (s * zoom), panStart.y - (y - dragStart.y) / (s * zoom), zoom);
      setPanX(px);
      setPanY(py);
      return;
    }

    let found = -1;
    for (let i = 0; i < curves.length; i++) {
      let minD = Infinity;
      for (let j = 0; j < curves[i].pts.length - 1; j++) {
        const [ax, ay] = w2s(curves[i].pts[j][0], curves[i].pts[j][1]);
        const [bx, by] = w2s(curves[i].pts[j + 1][0], curves[i].pts[j + 1][1]);
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        minD = Math.min(minD, Math.hypot(ax + t * dx - x, ay + t * dy - y));
      }
      if (minD < 8) {
        found = i;
        break;
      }
    }

    setHoveredIdx(found);
    if (tooltipRef.current && found >= 0) {
      tooltipRef.current.textContent = curves[found].label;
      tooltipRef.current.style.opacity = '1';
      let tx = x + 14, ty = y - 10;
      if (tx + 200 > canvasWidth) tx = x - 210;
      if (ty < 0) ty = y + 14;
      tooltipRef.current.style.left = tx + 'px';
      tooltipRef.current.style.top = ty + 'px';
    } else if (tooltipRef.current) {
      tooltipRef.current.style.opacity = '0';
    }
    if (cvRef.current) cvRef.current.style.cursor = found >= 0 ? 'pointer' : 'crosshair';
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredIdx(-1);
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (curves.length === 0) return;
    const rect = cvRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found = -1;
    for (let i = 0; i < curves.length; i++) {
      let minD = Infinity;
      for (let j = 0; j < curves[i].pts.length - 1; j++) {
        const [ax, ay] = w2s(curves[i].pts[j][0], curves[i].pts[j][1]);
        const [bx, by] = w2s(curves[i].pts[j + 1][0], curves[i].pts[j + 1][1]);
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        minD = Math.min(minD, Math.hypot(ax + t * dx - x, ay + t * dy - y));
      }
      if (minD < 8) {
        found = i;
        break;
      }
    }
    setLockedIdx(found === lockedIdx ? -1 : found);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const newZoom = applyZoomClamp(zoom * (e.deltaY < 0 ? 1.12 : 0.89));
    setZoom(newZoom);
    const [px, py] = clampPan(panX, panY, newZoom);
    setPanX(px);
    setPanY(py);
  };

  // Export
  const doExport = (content: string, filename: string, buttonEl: HTMLElement) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    const orig = buttonEl.textContent;
    buttonEl.textContent = '✓';
    buttonEl.classList.add('done');
    setTimeout(() => {
      buttonEl.textContent = orig;
      buttonEl.classList.remove('done');
    }, 1800);
  };

  const doCopy = (text: string, btn: HTMLElement) => {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.classList.add('done');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('done');
      }, 1800);
    });
  };

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: '52px 1fr', gridTemplateColumns: '360px 1fr 400px' }}>
      <style>{`
        :root {
          --bg: #F4F4F4; --surface: #FFFFFF; --surface2: #F7F7F7;
          --border: #E4E4E4; --border2: #CECECE; --text: #1A1A1A;
          --muted: #555555; --subtle: #888888; --accent: #2563EB;
          --accent-light: #EFF4FF; --accent2: #059669; --accent2-light: #ECFDF5;
          --amber: #B45309; --amber-light: #FFFBEB;
          --radius: 10px; --shadow: 0 2px 14px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04);
          --shadow-sm: 0 1px 4px rgba(0,0,0,0.06); --mono: 'Noto Sans TC', monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: 'Geist', 'Noto Sans TC', sans-serif; font-size: 14px; }
        input[type="number"] {
          width: 100%; background: var(--surface2); border: 1px solid var(--border);
          border-radius: 7px; color: var(--text); font-family: var(--mono); font-size: 14px;
          padding: 7px 10px; outline: none; -moz-appearance: textfield;
        }
        input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type="number"]:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        input[type="range"] { flex: 1; -webkit-appearance: none; height: 3px; background: var(--border2); border-radius: 2px; outline: none; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: var(--accent); cursor: pointer; box-shadow: 0 1px 4px rgba(37,99,235,0.3);
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: none; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
        .btn-generate:hover { background: #1D55D1; }
        .btn-generate:active { transform: scale(.98); }
        .btn-sm:hover { border-color: var(--border2); color: var(--text); }
        .zoom-btn:hover { border-color: var(--accent); color: var(--accent); }
      `}</style>

      {/* Header */}
      <header style={{ gridColumn: '1 / -1', background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: 'var(--shadow-sm)', zIndex: 10 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Loft Section Generator</h1>
        <div style={{ width: '1px', height: '20px', background: 'var(--border2)' }} />
        <span style={{ fontSize: '22px', color: 'var(--subtle)', fontWeight: 300 }}>截面曲線產生工具</span>
      </header>

      {/* Left Panel */}
      <aside style={{ gridRow: 2, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 14px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Inner */}
        <div style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--subtle)', marginBottom: '10px' }}>內層：圓角矩形</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>寬 Width</strong></label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="number" value={inpW} onChange={(e) => setInpW(e.target.value)} min="1" step="0.1" />
                <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>mm</span>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>高 Height</strong></label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="number" value={inpH} onChange={(e) => setInpH(e.target.value)} min="1" step="0.1" />
                <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>mm</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>圓角半徑 Radius</strong></label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="number" value={inpR} onChange={(e) => setInpR(e.target.value)} min="0" step="0.1" />
              <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>mm</span>
            </div>
          </div>
        </div>

        {/* Outer */}
        <div style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--subtle)', marginBottom: '10px' }}>外層：圓形</div>
          <div>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>直徑 Diameter</strong></label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="number" value={inpD} onChange={(e) => setInpD(e.target.value)} min="2" step="0.1" />
              <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>mm</span>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>半徑 Radius</strong></label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 10px', color: 'var(--accent)', fontWeight: 500, fontFamily: 'var(--mono)' }}>
                {dispR}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>mm</span>
            </div>
          </div>
        </div>

        {/* Transition */}
        <div style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--subtle)', marginBottom: '10px' }}>過渡設定</div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>過渡曲線數量</strong> <span style={{ fontSize: '12px', color: 'var(--subtle)' }}>（不含兩端）</span></label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="range" min="1" max="10" step="1" value={slNum} onChange={(e) => setSlNum(e.target.value)} style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '15px', color: 'var(--accent)', minWidth: '32px', textAlign: 'right', fontWeight: 500 }}>{slNum}</span>
              <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>條</span>
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>IBL 點密度</strong></label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="range" min="256" max="2048" step="256" value={slPts} onChange={(e) => setSlPts(e.target.value)} style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '15px', color: 'var(--accent)', minWidth: '32px', textAlign: 'right', fontWeight: 500 }}>{slPts}</span>
              <span style={{ fontSize: '13px', color: 'var(--subtle)' }}>點/曲線</span>
            </div>
            <div style={{ marginTop: '5px', fontSize: '13px', color: 'var(--subtle)', lineHeight: 1.6 }}>數值越高，IBL 曲線越平滑，匯出檔案也越大。預設 1024。</div>
          </div>

          <div>
            <label style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}><strong>插值方式</strong></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px', marginTop: '2px' }}>
              {['linear', 'cosine', 'smoothstep', 'smootherstep'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setInterpMode(mode);
                    const descs: Record<string, string> = {
                      linear: '均勻分佈，曲率在中段變化較快',
                      cosine: '緩入緩出，兩端停留較久',
                      smoothstep: 'G1：端點一階導數=0，切線自然銜接',
                      smootherstep: 'G2：端點一階＋二階導數=0，曲率完全連續',
                    };
                    setInterpDesc(descs[mode] || '');
                    generate();
                  }}
                  style={{
                    background: interpMode === mode ? 'var(--accent-light)' : 'var(--surface2)',
                    border: `1px solid ${interpMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                    color: interpMode === mode ? 'var(--accent)' : 'var(--muted)',
                    borderRadius: '5px', fontFamily: 'var(--mono)', fontSize: '13px',
                    padding: '6px 0', cursor: 'pointer', textAlign: 'center', fontWeight: interpMode === mode ? 600 : 500,
                  }}
                >
                  {mode === 'linear' ? 'Linear' : mode === 'cosine' ? 'Cosine' : mode === 'smoothstep' ? 'G1' : 'G2'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, padding: '6px 8px', background: 'var(--surface2)', borderRadius: '5px' }}>
              {interpDesc}
            </div>
          </div>
        </div>

        {/* Notice */}
        {panelNotice && (
          <div style={{
            margin: '0 0 10px 0', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', lineHeight: 1.5,
            background: panelNotice.type === 'info' ? 'var(--accent-light)' : '#FEF2F2',
            border: panelNotice.type === 'info' ? '1px solid #BFDBFE' : '1px solid #FECACA',
            color: panelNotice.type === 'info' ? 'var(--accent)' : '#DC2626',
          }}>
            {panelNotice.text}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '7px' }}>
          <button onClick={generate} style={{
            flex: 1, padding: '9px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)', fontSize: '15px', fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 1px 4px rgba(37,99,235,0.2)',
          }} className="btn-generate">生成曲線</button>
          <button onClick={() => {
            if (!canvasState) return;
            const sections = equations.map((eq, idx) => `Begin section ! ${idx + 1}\nBegin curve ! ${idx + 1}\n${eq.iblData}`);
            const content = 'Open Arclength\n' + sections.join('\n\n') + '\n';
            const fname = `loft_all_${equations.length}curves.ibl`;
            const btn = document.getElementById('btn-all');
            if (btn) doExport(content, fname, btn);
          }} id="btn-all" style={{
            borderColor: '#A7F3D0', color: 'var(--accent2)', background: 'var(--accent2-light)',
            border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--mono)',
            fontSize: '13px', padding: '6px 9px', cursor: 'pointer', whiteSpace: 'nowrap',
          }} className="btn-sm all">↓ 全部 .ibl</button>
        </div>
      </aside>

      {/* Canvas */}
      <div ref={cvWrapRef} style={{ gridRow: 2, background: 'var(--bg)', display: 'flex', padding: '14px', position: 'relative' }} className="canvas-wrap">
        <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow)', flex: 1, display: 'flex' }}>
          <canvas
            ref={cvRef}
            width={canvasWidth}
            height={canvasHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
            onWheel={handleWheel}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          <div ref={tooltipRef} style={{
            position: 'absolute', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '5px 10px', fontFamily: 'var(--mono)', fontSize: '13px',
            pointerEvents: 'none', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap', opacity: 0, zIndex: 10,
          }} />
        </div>
        <div style={{ position: 'absolute', bottom: '24px', left: '24px', display: 'flex', gap: '4px', zIndex: 5 }}>
          <button onClick={() => { const z = applyZoomClamp(zoom * 1.25); setZoom(z); const [px, py] = clampPan(panX, panY, z); setPanX(px); setPanY(py); }} title="放大" style={{ width: '28px', height: '28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }} className="zoom-btn">+</button>
          <button onClick={() => { const z = applyZoomClamp(zoom * 0.8); setZoom(z); const [px, py] = clampPan(panX, panY, z); setPanX(px); setPanY(py); }} title="縮小" style={{ width: '28px', height: '28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }} className="zoom-btn">−</button>
          <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} title="重置" style={{ width: '28px', height: '28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }} className="zoom-btn">⟳</button>
        </div>
        <div style={{ position: 'absolute', bottom: '30px', right: '30px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--subtle)', display: 'flex', gap: '10px', pointerEvents: 'none' }}>
          <span>滾輪縮放</span><span>拖曳平移</span>
        </div>
      </div>

      {/* Equations */}
      <div style={{ gridRow: 2, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="eq-section">
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--subtle)', marginBottom: '4px' }}>方程式輸出</div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--subtle)' }}>參數 t ∈ [0, 1]，對應角度 0° → 360°</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '2px 9px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }} className="badge">IBL 為精確點座標</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {equations.map((eq, idx) => (
            <div key={idx} style={{ background: 'var(--surface2)', border: `1px solid ${highlightEqIdx === idx ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '10px 12px', flexShrink: 0, transition: 'border-color 0.2s ease', boxShadow: highlightEqIdx === idx ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none' }} className="eq-card">
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ borderLeft: `3px solid ${eq.color}`, paddingLeft: '8px', color: eq.color }}>{eq.label}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={(e) => doExport(`Open Arclength\nBegin section ! 1\nBegin curve ! 1\n${eq.iblData}\n`, eq.fileName, e.currentTarget)} style={{ borderColor: '#A7F3D0', color: 'var(--accent2)', background: 'var(--accent2-light)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--mono)', fontSize: '13px', padding: '6px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }} className="btn-sm ibl">↓ .ibl</button>
                  <button onClick={(e) => doCopy(eq.equation, e.currentTarget)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '13px', padding: '6px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }} className="btn-sm">copy</button>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: 2, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} className="eq-body" dangerouslySetInnerHTML={{ __html: eq.equation.replace(/^[xyz](?= =)/gm, '<span class="var">$&</span>').replace(/\b(\d+\.?\d*)\b/g, '<span class="val">$1</span>').replace(/\b(pow|abs|cos|sin)\b/g, '<span class="fn">$1</span>') }} />
              <div style={{ marginTop: '6px', padding: '5px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--subtle)', lineHeight: 1.8 }} className="check-row">
                起點 (<span style={{ color: 'var(--accent2)' }}>{fmtChk(eq.checkData.startPt[0])}</span>, <span style={{ color: 'var(--accent2)' }}>{fmtChk(eq.checkData.startPt[1])}</span>)　
                ¼周 (<span style={{ color: 'var(--accent2)' }}>{fmtChk(eq.checkData.quarterPt[0])}</span>, <span style={{ color: 'var(--accent2)' }}>{fmtChk(eq.checkData.quarterPt[1])}</span>)　
                閉合差 <span style={{ color: 'var(--accent2)' }}>{fmtChk(eq.checkData.closureErr)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
