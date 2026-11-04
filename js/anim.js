// 動畫一：食材拋進麵切；動畫二：麵切倒入碗公＋配料
import { makeVessel, slot } from './vessel.js';
import { img } from './menu.js';

const gsap = window.gsap;
const MAX_PIECES = 12;

function stage(caption) {
  const el = document.createElement('div');
  el.className = 'stage';
  el.innerHTML = `<div class="cap">${caption}</div><button class="btn ghost skip">略過動畫</button>`;
  document.body.appendChild(el);
  return el;
}

// 每份一塊，最多 MAX_PIECES 塊
function pieces(items) {
  const out = [];
  items.forEach(([id, q]) => { for (let i = 0; i < q; i++) out.push(id); });
  return out.slice(0, MAX_PIECES);
}

function foodImg(src, pos) {
  const im = document.createElement('img');
  im.src = src;
  im.style.left = pos.x + '%';
  im.style.top = pos.y + '%';
  im.style.width = pos.size + '%';
  im.style.zIndex = 1000 - Math.round(pos.y * 10);   // 堆在上面的蓋住下面的
  gsap.set(im, { xPercent: -50, yPercent: -50 });
  return im;
}

// 拋物線：垂直受重力（二次貝茲曲線），終點是 (0,0)＝落點
// fx, fy：起點相對落點的位移（px）；lift：頂點比起點／終點中較高者再高多少
// aimFirst：水平移動提早完成，最後一段近乎垂直落下（丟進網籃時不會斜穿網壁）
function toss(tl, im, { fx, fy, lift, dur, at, spin, vessel, aimFirst }) {
  const apex = Math.min(fy, 0) - lift;
  const r0 = spin, r1 = (Math.random() - .5) * 16;
  const p = { t: 0 };
  tl.set(im, { opacity: 1 }, at);
  tl.to(p, {
    t: 1, duration: dur, ease: 'none',
    onUpdate() {
      const t = p.t, u = 1 - t;
      const ux = aimFirst ? Math.max(0, 1 - t / .7) ** 2 : u;
      gsap.set(im, { x: fx * ux, y: u * u * fy + 2 * u * t * apex, rotation: r0 * ux + r1 * (1 - ux) });
    },
  }, at);
  // 落地：壓扁再彈回，容器跟著輕輕一沉
  tl.to(im, { scaleX: 1.12, scaleY: .86, duration: .09, ease: 'power1.out' }, at + dur)
    .to(im, { scaleX: 1, scaleY: 1, duration: .35, ease: 'elastic.out(1.1, .45)' }, at + dur + .09);
  if (vessel) tl.to(vessel, { y: '+=5', duration: .08, yoyo: true, repeat: 1, ease: 'sine.out' }, at + dur);
}

function steam(parent, x, y, n = 3) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'steam';
    s.style.left = `calc(${x}% + ${(i - 1) * 26}px)`;
    s.style.top = y + '%';
    parent.appendChild(s);
    gsap.fromTo(s, { y: 0, opacity: 0, scaleY: .6 },
      { y: -90, opacity: .9, scaleY: 1.2, duration: 1.6, delay: i * .35, repeat: -1, ease: 'sine.out', onRepeat() { gsap.set(s, { opacity: 0 }); } });
  }
}

function finish(el, tl, resolve) {
  const done = () => { tl.kill(); gsap.to(el, { opacity: 0, duration: .3, onComplete: () => { el.remove(); resolve(); } }); };
  el.querySelector('.skip').onclick = done;
  tl.eventCallback('onComplete', done);
}

export function dropToStrainer(items) {
  return new Promise(resolve => {
    const el = stage('下鍋囉！');
    const v = makeVessel('strainer');
    const w = Math.min(window.innerWidth * 0.82, 360);
    Object.assign(v.style, { width: w + 'px', left: `calc(50% - ${w * 0.4}px)`, bottom: '14%' });
    el.appendChild(v);

    const list = pieces(items);
    const tl = gsap.timeline();
    tl.from(v, { y: 300, duration: .6, ease: 'back.out(1.4)' });
    list.forEach((id, i) => {
      const im = foodImg(img(id), slot(v.rim, i, list.length));
      gsap.set(im, { opacity: 0 });
      v.food.appendChild(im);
      const side = i % 2 ? 1 : -1;                         // 左右輪流拋
      toss(tl, im, {
        fx: side * (w * .5 + Math.random() * 50),
        fy: -(w * .45 + Math.random() * 60),               // 從兩側上方拋進來，落下段夠陡才進得了網籃
        lift: 90 + Math.random() * 50,
        dur: .85 + Math.random() * .15,
        at: .55 + i * .28,
        spin: side * -(120 + Math.random() * 120),
        vessel: v,
        aimFirst: true,
      });
    });
    tl.to(v, { rotation: 3, duration: .1, yoyo: true, repeat: 3, transformOrigin: '40% 80%' }, '+=.35')
      .add(() => steam(el, 45, 40), '<')
      .to({}, { duration: 1.2 });
    finish(el, tl, resolve);
  });
}

export function pourToBowl(order) {
  return new Promise(resolve => {
    const el = stage('起鍋！');
    const W = window.innerWidth;
    const bw = Math.min(W * 0.9, 400);
    const bowl = makeVessel('bowl');
    Object.assign(bowl.style, { width: bw + 'px', left: `calc(50% - ${bw / 2}px)`, bottom: '6%' });
    const sw = Math.min(W * 0.6, 260);
    const st = makeVessel('strainer');
    Object.assign(st.style, { width: sw + 'px', right: '-4%', top: '16%' });
    el.append(bowl, st);

    const list = pieces(order.items);
    const inStrainer = list.map((id, i) => {
      const im = foodImg(img(id), slot(st.rim, i, list.length));
      st.food.appendChild(im);
      return im;
    });

    const tl = gsap.timeline();
    tl.from(bowl, { y: 300, duration: .6, ease: 'back.out(1.3)' })
      .from(st, { x: 300, y: -60, duration: .7, ease: 'power2.out' }, '-=.2')
      .to(st, { y: -14, duration: .12, yoyo: true, repeat: 5 })              // 瀝乾
      .add(() => drips(el, st))
      .to(st, { rotation: -115, x: -bw * 0.28, y: 10, duration: .7, ease: 'power2.inOut', transformOrigin: '36% 52%' })
      .add(() => {
        // 食材從麵切開口滑出，沿拋物線落進碗公
        const sr = st.getBoundingClientRect();
        const br = bowl.getBoundingClientRect();
        const mx = sr.left + sr.width * .25, my = sr.top + sr.height * .55;
        inStrainer.forEach(im => im.remove());
        const t2 = gsap.timeline();
        list.forEach((id, i) => {
          const p = slot(bowl.rim, i, list.length);
          p.size *= .6;
          const im = foodImg(img(id), p);
          gsap.set(im, { opacity: 0 });
          bowl.food.appendChild(im);
          const tx = br.left + br.width * p.x / 100, ty = br.top + br.height * p.y / 100;
          toss(t2, im, {
            fx: mx - tx + (Math.random() - .5) * 20, fy: my - ty,
            lift: 30 + Math.random() * 30,                 // 倒出時只往上帶一點點
            dur: .6 + Math.random() * .1, at: i * .09,
            spin: (Math.random() - .5) * 160,
          });
        });
        t2.to(bowl, { y: '+=6', duration: .1, yoyo: true, repeat: 1 }, .5);
      })
      .to({}, { duration: .8 + list.length * .09 })
      .to(st, { x: 400, opacity: 0, duration: .5, ease: 'power2.in' });

    toppings(tl, bowl, order.toppings);
    tl.add(() => { steam(el, 46, 50); sparkle(el, bowl); el.querySelector('.cap').textContent = `${order.no} 號 請取餐 🎉`; })
      .to({}, { duration: 2.2 });
    finish(el, tl, resolve);
  });
}

function drips(el, st) {
  const r = st.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    d.className = 'bit';
    Object.assign(d.style, { width: '6px', height: '9px', background: '#a8692c', left: r.left + r.width * (.2 + Math.random() * .3) + 'px', top: r.top + r.height * .85 + 'px' });
    el.appendChild(d);
    gsap.to(d, { y: 160 + Math.random() * 80, opacity: 0, duration: .7, delay: i * .06, ease: 'power2.in', onComplete: () => d.remove() });
  }
}

function toppings(tl, bowl, tp) {
  const R = bowl.rim;
  if (tp.pickles) {
    tl.add(() => {
      const im = foodImg('assets/props/pickles.webp', { x: R.cx + 14, y: R.cy - 2, size: 26 });
      bowl.food.appendChild(im);
      gsap.from(im, { y: -400, duration: .7, ease: 'bounce.out' });
    }).to({}, { duration: .6 });
  }
  if (tp.scallion) {
    tl.add(() => sprinkle(bowl, 'scallion', 26, R)).to({}, { duration: .8 });
  }
  if (tp.spice > 0) {
    // 辣粉罐掛在碗公元素裡，位置跟著碗走（不用量螢幕座標）
    const jar = document.createElement('img');
    jar.src = 'assets/props/chili.webp';
    jar.className = 'jar';
    bowl.appendChild(jar);
    gsap.set(jar, { opacity: 0, rotation: 150 });
    tl.set(jar, { opacity: 1 })
      .from(jar, { y: -300, duration: .45, ease: 'power2.out' });
    for (let i = 0; i < tp.spice; i++) {
      tl.to(jar, { y: -26, rotation: 140, duration: .13, ease: 'power1.out' })
        .to(jar, { y: 0, rotation: 155, duration: .13, ease: 'power1.in', onComplete: () => sprinkle(bowl, 'chili', 18, R) });
    }
    tl.to(jar, { y: -400, opacity: 0, duration: .4 }, '+=.3');
  }
}

function sprinkle(bowl, kind, n, R) {
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i');
    b.className = `bit ${kind}`;
    const x = R.cx + (Math.random() - .5) * R.rx * 1.2;
    const y = R.cy - R.ry * (Math.random() * 1.2);
    Object.assign(b.style, { left: x + '%', top: y + '%', zIndex: 2000 });
    bowl.food.appendChild(b);
    gsap.from(b, { y: -260 - Math.random() * 60, x: (Math.random() - .5) * 40, duration: .5 + Math.random() * .3, ease: 'power2.in' });
  }
}

function sparkle(el, bowl) {
  const r = bowl.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    Object.assign(s.style, { left: r.left + r.width / 2 + 'px', top: r.top + r.height * .3 + 'px' });
    el.appendChild(s);
    const a = Math.random() * Math.PI * 2;
    gsap.to(s, { x: Math.cos(a) * 160, y: Math.sin(a) * 120 - 40, opacity: 0, scale: .3, duration: 1.1, ease: 'power2.out', onComplete: () => s.remove() });
  }
}
