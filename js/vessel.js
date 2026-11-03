// 容器（麵切、碗公）：同一張圖疊兩層，前層只保留開口前緣以下，食材夾在中間，看起來就是「在裡面」
// rim：開口橢圓（以圖片寬高的百分比表示）
export const RIMS = {
  strainer: { src: 'assets/props/strainer.webp', cx: 36.8, cy: 51.6, rx: 23.2, ry: 8.4 },
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
  el.innerHTML = `<img class="v-back" src="${r.src}" alt=""><div class="v-food"></div><img class="v-front" src="${r.src}" alt="">`;
  el.querySelector('.v-front').style.clipPath = frontClip(r);
  el.rim = r;
  el.food = el.querySelector('.v-food');
  return el;
}

// 第 i 個食材在容器裡的落點（百分比）：先填底層、再往上堆
// 底層的中心壓在碗緣線以下，下半截被前層碗壁擋住，看起來是「沉在裡面」
export function slot(rim, i, n) {
  const layer = Math.floor(i / 4);
  const k = i % 4;
  const spread = [-0.45, 0.45, -0.12, 0.2][k] + (layer % 2 ? 0.18 : 0);
  return {
    x: rim.cx + rim.rx * spread * 0.85,
    y: rim.cy + rim.ry * (0.55 - layer * 0.55) - (k > 1 ? rim.ry * 0.35 : 0),
    size: rim.rx * (n > 8 ? 0.66 : 0.8),
  };
}
