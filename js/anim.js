// 動畫一：食材投入麵切；動畫二：麵切倒入碗公＋配料
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

function foodImg(id, pos) {
  const im = document.createElement('img');
  im.src = img(id);
  im.style.left = pos.x + '%';
  im.style.top = pos.y + '%';
  im.style.width = pos.size + '%';
  gsap.set(im, { xPercent: -50, yPercent: -50 });
  return im;
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
      const p = slot(v.rim, i, list.length);
      const im = foodImg(id, p);
      v.food.appendChild(im);
      const fromX = (Math.random() - .5) * w * 1.2;
      tl.fromTo(im, { x: fromX, y: -window.innerHeight * .75, rotation: (Math.random() - .5) * 200, opacity: 1 },
        { x: 0, duration: .75, ease: 'power1.out', rotation: (Math.random() - .5) * 30 }, .5 + i * .22)
        .fromTo(im, { y: -window.innerHeight * .75 }, { y: 0, duration: .75, ease: 'bounce.out' }, '<');
    });
    tl.to(v, { rotation: 4, duration: .08, yoyo: true, repeat: 5, transformOrigin: '40% 80%' }, '+=.1')
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
      const im = foodImg(id, slot(st.rim, i, list.length));
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
        // 食材從麵切開口改放到碗公裡，往下落
        const sr = st.getBoundingClientRect();
        const br = bowl.getBoundingClientRect();
        const mx = ((sr.left + sr.width * .25 - br.left) / br.width) * 100;
        const my = ((sr.top + sr.height * .55 - br.top) / br.height) * 100;
        inStrainer.forEach(im => im.remove());
        const t2 = gsap.timeline();
        list.forEach((id, i) => {
          const p = slot(bowl.rim, i, list.length);
          p.size *= .55;
          const im = foodImg(id, p);
          bowl.food.appendChild(im);
          const dx = ((mx - p.x) / 100) * br.width;
          const dy = ((my - p.y) / 100) * br.height;
          t2.fromTo(im, { x: dx, y: dy, rotation: (Math.random() - .5) * 180 },
            { x: 0, y: 0, rotation: (Math.random() - .5) * 30, duration: .55, ease: 'bounce.out' }, i * .07);
        });
      })
      .to({}, { duration: .4 + list.length * .07 })
      .to(st, { x: 400, opacity: 0, duration: .5, ease: 'power2.in' });

    toppings(tl, el, bowl, order.toppings);
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

function toppings(tl, el, bowl, tp) {
  const R = bowl.rim;
  if (tp.pickles) {
    tl.add(() => {
      const im = foodImg('', { x: R.cx + 14, y: R.cy - 6, size: 26 });
      im.src = 'assets/props/pickles.webp'; // 酸菜不是菜單品項，換成配料圖
      bowl.food.appendChild(im);
      gsap.from(im, { y: -400, duration: .6, ease: 'bounce.out' });
    }).to({}, { duration: .5 });
  }
  if (tp.scallion) {
    tl.add(() => sprinkle(bowl, 'scallion', 26, R)).to({}, { duration: .8 });
  }
  if (tp.spice > 0) {
    const jar = document.createElement('img');
    jar.src = 'assets/props/chili.webp';
    const br = bowl.getBoundingClientRect();
    Object.assign(jar.style, { position: 'absolute', width: '110px', left: br.left + br.width * .5 - 55 + 'px', top: br.top - 150 + 'px', transform: 'rotate(170deg)' });
    tl.add(() => el.appendChild(jar))
      .from(jar, { y: -300, duration: .4, ease: 'power2.out' });
    for (let i = 0; i < tp.spice; i++) {
      tl.to(jar, { y: -30, duration: .12, ease: 'power1.out' })
        .to(jar, { y: 0, duration: .12, ease: 'power1.in', onComplete: () => sprinkle(bowl, 'chili', 18, R) });
    }
    tl.to(jar, { y: -400, opacity: 0, duration: .4 }, '+=.3');
  }
}

function sprinkle(bowl, kind, n, R) {
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i');
    b.className = `bit ${kind}`;
    const x = R.cx + (Math.random() - .5) * R.rx * 1.2;
    const y = R.cy - R.ry * (.2 + Math.random() * 1.4);
    Object.assign(b.style, { left: x + '%', top: y + '%' });
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
