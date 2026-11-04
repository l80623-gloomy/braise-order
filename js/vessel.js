// 容器（麵切、碗公）：同一張圖疊兩層，前層只保留開口前緣以下，食材夾在中間，看起來就是「在裡面」
// rim：開口橢圓（以圖片寬高的百分比表示）
export const RIMS = {
  // front：前層用圖（麵切用網孔挖透明的版本，食材會從網孔透出來）
  // body：網籃內壁輪廓 [高度, 左壁, 右壁]（%），食材從網底一排排往上堆
  strainer: { src: 'assets/props/strainer.webp', front: 'assets/props/strainer-front.webp', cx: 36.8, cy: 51.6, rx: 23.2, ry: 8.4,
    body: [[51.6, 14.4, 59], [70, 16.6, 55.4], [82, 18, 53.6], [88, 20, 52]] },
  bowl: { src: 'assets/props/bowl.webp', cx: 49.8, cy: 28.4, rx: 44.4, ry: 11.2 },
};

function frontClip({ cx, cy, rx, ry }) {
  const pts = [`100% ${cy}%`];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI * i) / 24;
    pts.push(`${(cx + rx * Math.cos(t)).toFixed(2)}% ${(cy + ry * Math.sin(t)).toFixed(2)}%`);
  }
  pts.push(`0% ${cy}%`, '0% 100%', '100% 100%');
  return `polygon(${pts.join(',')})`;
}

export function makeVessel(kind) {
  const r = RIMS[kind];
  const el = document.createElement('div');
  el.className = `vessel vessel-${kind}`;
  el.innerHTML = `<img class="v-back" src="${r.src}" alt=""><div class="v-food"></div><img class="v-front" src="${r.front || r.src}" alt="">`;
  el.querySelector('.v-front').style.clipPath = frontClip(r);
  el.rim = r;
  el.food = el.querySelector('.v-food');
  return el;
}

// 某高度的內壁左右位置（線性內插）；碗口以上沿用碗口寬
function wallsAt(body, y) {
  if (y <= body[0][0]) return [body[0][1], body[0][2]];
  for (let i = 1; i < body.length; i++) {
    const [y1, l1, r1] = body[i], [y0, l0, r0] = body[i - 1];
    if (y <= y1) { const t = (y - y0) / (y1 - y0); return [l0 + (l1 - l0) * t, r0 + (r1 - r0) * t]; }
  }
  const last = body[body.length - 1];
  return [last[1], last[2]];
}

// 有 body 的容器：從底部一排排往上堆，每排放得下幾塊就放幾塊
// 每塊都整塊落在內壁以內（左右各留半塊＋一點邊距），不靠裁切，邊緣才不會被切出直線
function pile(rim, n) {
  const size = rim.rx * (n > 8 ? 0.66 : 0.8);
  const bottom = rim.body[rim.body.length - 1][0];
  const out = [];
  let y = bottom - size * 0.42, row = 0;
  while (out.length < n) {
    const [l, r] = wallsAt(rim.body, y);
    const span = Math.max(0, r - l - size * 0.9);
    const cap = Math.floor(span / (size * 0.72)) + 1;
    const k = Math.min(cap, n - out.length);
    const jog = row % 2 ? 1 : -1;
    for (let j = 0; j < k; j++) {
      const x = k === 1 ? (l + r) / 2 + jog * Math.min(2, span / 2) : l + size * 0.45 + (span * j) / (k - 1);
      out.push({ x, y: y - (j % 2) * 1.5, size });
    }
    y -= size * 0.62; row++;
  }
  return out;
}

const pileCache = new Map();

// 第 i 個食材在容器裡的落點（百分比）
// 麵切：由網底往上堆；碗公：中心壓在碗緣線以下，下半截被前層碗壁擋住
export function slot(rim, i, n) {
  if (rim.body) {
    const key = `${rim.src}|${n}`;
    if (!pileCache.has(key)) pileCache.set(key, pile(rim, n));
    return { ...pileCache.get(key)[i] };
  }
  const layer = Math.floor(i / 4);
  const k = i % 4;
  const spread = [-0.45, 0.45, -0.12, 0.2][k] + (layer % 2 ? 0.18 : 0);
  return {
    x: rim.cx + rim.rx * spread * 0.85,
    y: rim.cy + rim.ry * (0.55 - layer * 0.55) - (k > 1 ? rim.ry * 0.35 : 0),
    size: rim.rx * (n > 8 ? 0.66 : 0.8),
  };
}
