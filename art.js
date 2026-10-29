/* ==================================================================
   art.js — a small pantheon, drawn in pencil in the open space
   to the right of the page.

   Shannon, Archimedes, Gauss, Newton, Sutskever and Kepler take turns.
   Each figure draws
   itself stroke by stroke, holds, fades, and hands over to the next.
   Click the drawing to skip ahead. Day and night palettes follow
   <html data-theme>, set before paint by the <head> script.
   Pages without #art (posts) only get the flat ground.
   ================================================================== */
(() => {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const root = document.documentElement;

let W = innerWidth;
let H = innerHeight;

/* ---------- palette ---------- */

const isDark = () => root.dataset.theme === 'dark';
const palette = () => (isDark()
  ? { ground: '#000000', ink: [255, 255, 255], red: [239, 90, 66] }
  : { ground: '#ffffff', ink: [0, 0, 0], red: [214, 52, 34] });
let T = palette();

/* ---------- ground: a flat fill ---------- */

function drawPaper(canvas) {
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  const c = canvas.getContext('2d');
  c.fillStyle = T.ground;
  c.fillRect(0, 0, canvas.width, canvas.height);
}

const paperCanvas = document.getElementById('paper');
if (paperCanvas) drawPaper(paperCanvas);

/* ---------- theme switching ---------- */

const themeListeners = [];

function applyTheme(theme, remember) {
  root.dataset.theme = theme;
  if (remember) { try { localStorage.setItem('theme', theme); } catch (e) {} }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#000000' : '#ffffff';
  T = palette();
  if (paperCanvas) drawPaper(paperCanvas);
  for (const fn of themeListeners) fn();
}

document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => applyTheme(isDark() ? 'light' : 'dark', true));
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch (err) {}
  if (!stored) applyTheme(e.matches ? 'dark' : 'light', false);
});

const art = document.getElementById('art');
if (!art) {
  // a post: just keep the ground sized
  let t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { W = innerWidth; H = innerHeight; if (paperCanvas) drawPaper(paperCanvas); }, 150);
  });
  return;
}

const g = art.getContext('2d');

function sizeArt() {
  art.width = Math.round(W * DPR);
  art.height = Math.round(H * DPR);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* ---------- where to draw ---------- */

// The open space to the right of the content. Without enough of it
// (phones, small windows) there is simply no drawing.
let R = null;

function region() {
  let right = 0;
  document.querySelectorAll('.site > *').forEach((el) => {
    right = Math.max(right, el.getBoundingClientRect().right);
  });
  const left = right + 24, top = 76, bottom = H - 28;
  const w = W - 20 - left;
  return w >= 170 ? { x: left, y: top, w, h: bottom - top } : null;
}

/* ---------- pencil helpers ---------- */

const ink = (a) => rgba(T.ink, a);
const red = (a) => rgba(T.red, a);
const prog = (t, start, dur) => clamp((t - start) / dur, 0, 1);

function seg(x1, y1, x2, y2, f = 1) {
  if (f <= 0) return;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(lerp(x1, x2, f), lerp(y1, y2, f));
  g.stroke();
}

// draw a polyline through `pts` ([[x,y],…]) as a pen would, one segment per `per` ms
function pen(pts, t, start, per) {
  const done = (t - start) / per;
  if (done <= 0) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const f = clamp(done - (i - 1), 0, 1);
    if (f <= 0) break;
    g.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
  }
  g.stroke();
}

// draw the first fraction `f` of a dense polyline
function trace(pts, f) {
  const m = f * (pts.length - 1);
  if (m <= 0) return;
  const k = Math.floor(m);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= k; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (k < pts.length - 1) {
    const r = m - k;
    g.lineTo(lerp(pts[k][0], pts[k + 1][0], r), lerp(pts[k][1], pts[k + 1][1], r));
  }
  g.stroke();
}

function dot(x, y, r, style) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = style;
  g.fill();
}


// a point a fraction `f` of the way along a polyline (by vertex index)
function pointAt(pts, f) {
  const m = clamp(f, 0, 1) * (pts.length - 1), k = Math.min(Math.floor(m), pts.length - 2);
  if (pts.length < 2) return pts[0];
  const r = m - k;
  return [lerp(pts[k][0], pts[k + 1][0], r), lerp(pts[k][1], pts[k + 1][1], r)];
}

/* S — Shannon: Bernoulli tiles sweep from certainty through maximum
   entropy to certainty again. The surrounding arc measures H(p). */
const shannon = {
  init(R) {
    this.dur=19000;
    this.seed=Math.random()*10000;
  },
  draw(t) {
    const cx=R.x+R.w/2,cy=R.y+R.h/2;
    const size=Math.min(R.w*.66,R.h*.48),cell=size/12;
    const radius=size*.77;
    const probability=time=>.5-.5*Math.cos(Math.PI*prog(time,1500,14000));
    const entropy=p=>p<=0||p>=1?0:-p*Math.log2(p)-(1-p)*Math.log2(1-p);
    const random=(i,k)=>{const v=Math.sin(i*127.1+k*311.7+this.seed)*43758.5453;return v-Math.floor(v);};
    const p=probability(t),h=entropy(p);
    // A fine circular gauge fills and empties with uncertainty.
    g.lineWidth=.7;g.strokeStyle=ink(.12);
    g.beginPath();g.arc(cx,cy,radius,0,TAU);g.stroke();
    if(h>0){
      g.lineWidth=1.6;g.strokeStyle=red(.65);
      g.beginPath();g.arc(cx,cy,radius,-Math.PI/2,-Math.PI/2+TAU*h);g.stroke();
      dot(cx+radius*Math.sin(TAU*h),cy-radius*Math.cos(TAU*h),3,red(.9));
    }
    // Staggered coin flips travel diagonally through the mosaic. Each
    // face is a sampled bit; the 50/50 middle has the greatest entropy.
    for(let row=0;row<12;row++)for(let col=0;col<12;col++){
      const i=row*12+col,delay=(row+col)*24;
      const clock=Math.max(0,t-delay),epoch=Math.floor(clock/750),phase=clock%750/750;
      const prev=epoch===0?0:Number(random(i,epoch-1)<probability((epoch-1)*750+delay));
      const next=Number(random(i,epoch)<probability(epoch*750+delay));
      const flip=easeInOut(clamp(phase/.65,0,1));
      const face=flip<.5?prev:next;
      const squeeze=prev===next?1:Math.max(.07,Math.abs(Math.cos(Math.PI*flip)));
      const x=cx+(col-5.5)*cell,y=cy+(row-5.5)*cell;
      g.save();g.translate(x,y);
      g.rotate(h*.07*Math.sin(t/900+row*.5+col*.6));
      g.scale(squeeze,1);
      g.fillStyle=face?red(.78):ink(.12);
      g.strokeStyle=face?red(.8):ink(.35);g.lineWidth=.6;
      const side=cell*.68;
      g.fillRect(-side/2,-side/2,side,side);
      g.strokeRect(-side/2,-side/2,side,side);
      g.restore();
    }
  },
};

/* ==================================================================
   A — Archimedes. A circle caught between inscribed and circumscribed
   polygons of 6, 12, 24, 48 and 96 sides: his squeeze on π.
   ================================================================== */

const archimedes = {
  init(R) {
    this.r = Math.min(R.w, R.h) * 0.4;
    this.cx = R.x + R.w / 2;
    this.cy = R.y + R.h / 2;
    this.dur = 17000;
  },
  draw(t) {
    const { cx, cy, r } = this;
    const poly = (n, rad) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i * TAU) / n;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
      return pts;
    };

    g.lineWidth = 1.2;
    g.strokeStyle = red(0.8);
    const c = prog(t, 0, 1600);
    if (c > 0) { g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * c); g.stroke(); }

    const stages = [6, 12, 24, 48, 96];
    stages.forEach((n, k) => {
      const t0 = 1800 + k * 2600;
      if (t < t0) return;
      // earlier polygons stay behind as ghosts once the next one arrives
      const ghost = k < stages.length - 1 && t > t0 + 2600 ? 0.28 : 1;
      g.lineWidth = 1;
      g.strokeStyle = ink(0.6 * ghost);
      trace(poly(n, r), prog(t, t0, 1100));
      g.strokeStyle = ink(0.32 * ghost);
      trace(poly(n, r / Math.cos(Math.PI / n)), prog(t, t0 + 900, 1100));
    });
  },
};

/* ==================================================================
   G — Gauss. Balls drop through a triangle of pegs, bouncing left or
   right at random, and pile up into the bell curve, which is then
   drawn over them.
   ================================================================== */

const gauss = {
  init(R) {
    const rows = 11, N = 160, rowMs = 85, dropMs = 380;
    const dx = Math.min((R.w * 0.86) / (rows + 1), 26);
    const dy = dx * 0.9;
    const ball = clamp(dx * 0.15, 2.2, 3.6);
    const cx = R.x + R.w / 2;
    const pegTop = R.y + Math.max(30, R.h * 0.08);
    const floor = R.y + R.h - 12;

    const counts = new Map();
    const balls = [];
    for (let i = 0; i < N; i++) {
      const steps = Array.from({ length: rows }, () => (Math.random() < 0.5 ? -0.5 : 0.5));
      const end = steps.reduce((a, b) => a + b, 0);
      const h = counts.get(end) || 0;
      counts.set(end, h + 1);
      balls.push({ spawn: 900 + i * 55, steps, end, h });
    }
    Object.assign(this, { rows, N, rowMs, dropMs, dx, dy, ball, cx, pegTop, floor, balls });
    this.tLast = 900 + (N - 1) * 55 + rows * rowMs + dropMs;
    this.dur = this.tLast + 4800;
  },
  draw(t) {
    const { rows, rowMs, dropMs, dx, dy, ball, cx, pegTop, floor } = this;

    // pegs, row by row
    for (let i = 0; i < rows; i++) {
      const a = prog(t, i * 70, 300);
      if (a <= 0) break;
      for (let j = 0; j <= i; j++) dot(cx + (j - i / 2) * dx, pegTop + i * dy, 1.4, ink(0.45 * a));
    }
    // bin walls
    g.lineWidth = 0.8;
    g.strokeStyle = ink(0.16);
    const binTop = pegTop + rows * dy;
    const w = prog(t, 400, 800);
    for (let k = -rows / 2 - 0.5; k <= rows / 2 + 0.51; k += 1) {
      const x = cx + k * dx;
      seg(x, floor, x, lerp(floor, binTop, 1), w);
    }

    for (const b of this.balls) {
      const age = t - b.spawn;
      if (age < 0) break;
      let x, y;
      if (age < rows * rowMs) {
        const row = Math.floor(age / rowMs), f = (age % rowMs) / rowMs;
        let off = 0;
        for (let i = 0; i < row; i++) off += b.steps[i];
        x = cx + (off + b.steps[row] * f) * dx;
        y = pegTop - dy * 0.5 + (row + f) * dy - Math.sin(f * Math.PI) * dy * 0.35;
      } else {
        const rest = floor - ball - b.h * ball * 2;
        const f = clamp((age - rows * rowMs) / dropMs, 0, 1);
        x = cx + b.end * dx;
        y = lerp(pegTop + (rows - 0.5) * dy, rest, f * f);
      }
      dot(x, y, ball, ink(0.72));
    }

    // the bell curve the balls were heading for
    const f = prog(t, this.tLast + 200, 2000);
    if (f > 0) {
      const sigma2 = rows / 4, pts = [];
      for (let k = -rows / 2 - 0.5; k <= rows / 2 + 0.5; k += 0.05) {
        const e = (this.N / Math.sqrt(TAU * sigma2)) * Math.exp(-(k * k) / (2 * sigma2));
        pts.push([cx + k * dx, floor - e * ball * 2]);
      }
      g.lineWidth = 1.4;
      g.strokeStyle = red(0.85);
      trace(pts, f);
    }
  },
};

/* ==================================================================
   N — Newton. His own example, x³ − 2x − 5 = 0: from a guess, follow
   the tangent down to the axis, climb back to the curve, repeat.
   ================================================================== */

const newton = {
  init(R) {
    const f = (x) => x * x * x - 2 * x - 5, df = (x) => 3 * x * x - 2;
    const x0 = -1.6, x1 = 3.7, y0 = -7, y1 = f(3.7) + 1;
    const sx = (R.w * 0.86) / (x1 - x0), sy = (R.h * 0.86) / (y1 - y0);
    const ox = R.x + R.w * 0.07 - x0 * sx, oy = R.y + R.h * 0.07 + y1 * sy;
    const m = (x, y) => [ox + x * sx, oy - y * sy];
    const curve = [];
    for (let x = x0; x <= x1 + 1e-9; x += 0.01) curve.push(m(x, f(x)));
    const xs = [3.5];
    while (xs.length < 6) {
      const x = xs[xs.length - 1], n = x - f(x) / df(x);
      xs.push(n);
      if (Math.abs(n - x) < 1e-3) break;
    }
    Object.assign(this, { f, m, curve, xs, x0, x1, y0, y1, dur: 3000 + (xs.length - 1) * 1700 + 3200 });
  },
  draw(t) {
    const { f, m, curve, xs, x0, x1, y0, y1 } = this;
    g.lineWidth = 0.8;
    g.strokeStyle = ink(0.22);
    seg(...m(x0, 0), ...m(x1, 0), prog(t, 0, 900));
    g.strokeStyle = ink(0.12);
    seg(...m(0, y0), ...m(0, y1), prog(t, 0, 900));

    g.lineWidth = 1.2;
    g.strokeStyle = ink(0.6);
    trace(curve, prog(t, 600, 1800));

    for (let k = 0; k < xs.length - 1; k++) {
      const t0 = 2800 + k * 1700;
      if (t < t0) break;
      const x = xs[k], nx = xs[k + 1];
      const [ax, ay] = m(x, 0), [px, py] = m(x, f(x)), [bx, by] = m(nx, 0);
      g.setLineDash([2, 3]);
      g.lineWidth = 0.8;
      g.strokeStyle = ink(0.32);
      seg(ax, ay, px, py, prog(t, t0, 450));
      g.setLineDash([]);
      if (t > t0 + 450) dot(px, py, 2.4, ink(0.85));
      // tangent, carried a little past the axis
      g.lineWidth = 1.1;
      g.strokeStyle = red(0.75);
      seg(px, py, lerp(px, bx, 1.12), lerp(py, by, 1.12), prog(t, t0 + 450, 750));
      if (t > t0 + 1200) {
        g.lineWidth = 1;
        g.strokeStyle = ink(0.55);
        seg(bx, by - 4, bx, by + 4);
      }
    }
    const done = 2800 + (xs.length - 1) * 1700;
    if (t > done) {
      const [rx, ry] = m(xs[xs.length - 1], 0), a = prog(t, done, 600);
      dot(rx, ry, 3.4, red(0.95 * a));
      g.strokeStyle = red(0.5 * a);
      g.lineWidth = 1;
      g.beginPath(); g.arc(rx, ry, 8, 0, TAU); g.stroke();
    }
  },
};

/* I — Ilya Sutskever: illustrative next-token distributions, not model output. */
const ilya = {
  init(R) {
    this.dur=18000;
    const choices=[
      [['learn',.55],['see',.3],['build',.15]],
      [['from',.65],['through',.25],['with',.1]],
      [['data',.5],['experience',.35],['examples',.15]],
    ];
    this.steps=choices.map(options=>{
      let u=Math.random(), sum=0, selected=options.length-1;
      for(let i=0;i<options.length;i++){sum+=options[i][1];if(u<sum){selected=i;break;}}
      return {options,selected};
    });
  },
  draw(t) {
    const phase=Math.max(0,t-900)/4800,step=Math.min(2,Math.floor(phase));
    const local=phase-step,chosen=local>.63;
    const {options,selected}=this.steps[step];
    const x=R.x+R.w*.16,w=R.w*.68,top=R.y+R.h*.44;
    const side=Math.min(24,w/7),gap=side*.5;
    const chainX=R.x+R.w/2-(4*side+3*gap)/2;
    const chainY=R.y+R.h*.28;
    // Abstract token tiles: the sampled candidate flies into the context.
    for(let i=0;i<4;i++){
      g.lineWidth=1;g.strokeStyle=ink(.22);
      g.strokeRect(chainX+i*(side+gap),chainY,side,side);
      if(i<=step){g.fillStyle=ink(.5);g.fillRect(chainX+i*(side+gap),chainY,side,side);}
    }
    options.forEach(([,p],i)=>{
      const y=top+i*52,active=chosen&&i===selected;
      g.fillStyle=ink(.07);g.fillRect(x,y,w,12);
      g.fillStyle=active?red(.8):ink(.38);
      g.fillRect(x,y,w*p*prog(local,0,.25),12);
      if(active){
        const f=easeInOut(prog(local,.63,.25));
        const tx=chainX+(step+1)*(side+gap),ty=chainY;
        const px=lerp(x+w*p,tx,f),py=lerp(y,ty,f)-Math.sin(f*Math.PI)*side*2;
        g.fillStyle=red(.8);g.fillRect(px,py,side,side);
      }
    });
  },
};

/* ==================================================================
   K — Kepler. A planet on an ellipse round the sun, slicing the orbit
   into twelve equal-time sectors: fat near the sun, thin far away,
   every one the same area.
   ================================================================== */

const kepler = {
  init(R) {
    const e = 0.62, k = Math.sqrt(1 - e * e);
    const a = Math.min(R.h * 0.4, (R.w * 0.46) / k);
    Object.assign(this, {
      e, a, b: a * k, c: a * e,
      cx: R.x + R.w / 2, cy: R.y + R.h / 2,
      T: 12000, t0: 2000, slices: 12, dur: 16500,
    });
  },
  pos(M) {
    // Kepler's equation, M = E − e·sin E, by Newton's method
    let E = M;
    for (let i = 0; i < 8; i++) E -= (E - this.e * Math.sin(E) - M) / (1 - this.e * Math.cos(E));
    return [this.cx + this.b * Math.sin(E), this.cy + this.a * Math.cos(E)];
  },
  draw(t) {
    const { cx, cy, a, b, c, T, t0, slices } = this;
    const sun = [cx, cy + c];
    const orbit = [];
    for (let i = 0; i <= 240; i++) {
      const E = (i / 240) * TAU;
      orbit.push([cx + b * Math.sin(E), cy + a * Math.cos(E)]);
    }

    const done = clamp((t - t0) / T, 0, 1);
    const sweepTo = (M0, M1, style) => {
      g.beginPath();
      g.moveTo(...sun);
      for (let M = M0; M <= M1 + 1e-9; M += (M1 - M0) / 40 || 1) g.lineTo(...this.pos(M));
      g.closePath();
      g.fillStyle = style;
      g.fill();
    };
    // equal-time sectors, alternately washed
    const step = TAU / slices, now = done * TAU;
    for (let j = 0; j < slices; j++) {
      const M0 = j * step;
      if (M0 >= now) break;
      sweepTo(M0, Math.min(M0 + step, now), j % 2 ? ink(0.05) : red(0.09));
      g.lineWidth = 0.7;
      g.strokeStyle = ink(0.22);
      seg(...sun, ...this.pos(M0));
    }

    g.lineWidth = 1.1;
    g.strokeStyle = ink(0.55);
    trace(orbit, prog(t, 0, 1600));

    dot(...sun, 4.5, red(0.95 * prog(t, 1000, 600)));

    if (t >= t0) {
      const p = this.pos(now);
      g.lineWidth = 0.9;
      g.strokeStyle = ink(0.4);
      seg(...sun, ...p);
      dot(...p, 3.4, ink(0.9));
    }
  },
};

/* ---------- the rotation: S · A · G · N · I · K ---------- */

const FIGURES = [shannon, archimedes, gauss, newton, ilya, kepler];
const NAMES = ['shannon', 'archimedes', 'gauss', 'newton', 'ilya', 'kepler'];
let idx = 0;
let started = performance.now();

function begin(i, now) {
  idx = i;
  started = now;
  if (R) FIGURES[idx].init(R);
}

function render(now) {
  g.clearRect(0, 0, W, H);
  if (!R) return false;
  const fig = FIGURES[idx];
  const t = now - started;
  g.save();
  g.globalAlpha = Math.min(clamp(t / 800, 0, 1), clamp((fig.dur - t) / 1200, 0, 1));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  fig.draw(t);
  g.restore();
  return t >= fig.dur;
}

function layout() {
  W = innerWidth; H = innerHeight;
  sizeArt();
  R = region();
  if (R) FIGURES[idx].init(R);
}

layout();

// click the drawing to move on to the next letter
art.addEventListener('click', () => {
  const fig = FIGURES[idx];
  const t = performance.now() - started;
  if (t < fig.dur - 1200) started = performance.now() - (fig.dur - 1200);
});

if (REDUCED) {
  // no motion: one finished figure, still
  const still = () => render(started + FIGURES[idx].dur - 1300);
  still();
  themeListeners.push(still);
  addEventListener('resize', () => { layout(); still(); });
  return;
}

// The loop only runs while there is room to draw (never on phones), and
// only starts once the page has loaded, so it never competes with first paint.
let running = false;
function frame(now) {
  if (!R) { g.clearRect(0, 0, W, H); running = false; return; }
  if (render(now)) begin((idx + 1) % FIGURES.length, now);
  requestAnimationFrame(frame);
}
function start() {
  if (running || !R) return;
  running = true;
  started = performance.now();
  requestAnimationFrame(frame);
}

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { layout(); started = performance.now(); start(); }, 120);
});
// fonts arriving can shift the boxes; re-measure once they're in
if (document.fonts) document.fonts.ready.then(() => { R = region(); if (R) FIGURES[idx].init(R); start(); });

if (document.readyState === 'complete') start();
else addEventListener('load', start, { once: true });
})();
