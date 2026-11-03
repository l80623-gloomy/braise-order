// 客人端：竹牌點餐 → 配料／付款 → 投入麵切 → 等候 → 倒入碗公
import { CATEGORIES, ITEMS, SPICE, PAY, img, total } from './menu.js';
import { send, listen, reduce } from './bus.js';
import { dropToStrainer, pourToBowl } from './anim.js';

const $ = s => document.querySelector(s);
const gsap = window.gsap;
const KEY = 'braise.myOrder';
const SEEN = 'braise.seenDone';

const cart = {};                       // id → 數量
const tp = { spice: 0, scallion: false, pickles: false };
let pay = 'cash';
let orders = {};
let myId = store(KEY);

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { return null; }
}

/* ── 竹牌牆 ── */
function renderWall() {
  $('#tabs').innerHTML = CATEGORIES.map((c, i) => `<button data-k="${c.key}" class="${i ? '' : 'on'}">${c.name}</button>`).join('');
  $('#wall').innerHTML = CATEGORIES.map(c => `
    <div class="row" id="row-${c.key}">
      <div class="row-title">${c.name}</div>
      <div class="rack"><div class="pole"></div><div class="slats">
        ${c.items.map(it => `
          <button class="slat" data-id="${it.id}">
            <img src="${img(it.id)}" alt="" loading="lazy">
            <span class="nm ${it.name.length > 4 ? 'long' : ''}">${it.name}</span>
            <span class="pr">${it.unit} <b>${it.price}</b></span>
          </button>`).join('')}
      </div></div>
    </div>`).join('');
  document.querySelectorAll('.pole').forEach(p => { p.style.width = p.nextElementSibling.scrollWidth + 'px'; });

  $('#tabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#row-' + b.dataset.k).scrollIntoView({ behavior: 'smooth' });
  };
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    const k = en.target.id.slice(4);
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  }), { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('.row').forEach(r => io.observe(r));

  $('#wall').onclick = e => {
    const s = e.target.closest('.slat'); if (!s) return;
    cart[s.dataset.id] = (cart[s.dataset.id] || 0) + 1;
    gsap.fromTo(s, { rotation: -7 }, { rotation: 0, duration: .9, ease: 'elastic.out(1.2, .3)' });
    refresh();
  };
  $('#goBtn').onclick = openSheet;
}

function cartItems() { return Object.entries(cart).filter(([, q]) => q > 0); }

function refresh() {
  document.querySelectorAll('.slat').forEach(s => {
    const q = cart[s.dataset.id] || 0;
    s.classList.toggle('picked', q > 0);
    let k = s.querySelector('.knot');
    if (q && !k) { k = document.createElement('span'); k.className = 'knot'; s.appendChild(k); }
    if (k) q ? (k.textContent = q) : k.remove();
  });
  const items = cartItems();
  $('#cnt').textContent = items.reduce((s, [, q]) => s + q, 0);
  $('#tot').textContent = total(items);
  $('#goBtn').disabled = !items.length;
}

/* ── 確認面板：品項、配料、付款 ── */
function openSheet() {
  $('#sheetBg').classList.remove('hidden');
  renderSheet();
}
function closeSheet() { $('#sheetBg').classList.add('hidden'); }
$('#sheetBg').onclick = e => { if (e.target.id === 'sheetBg') closeSheet(); };

function renderSheet() {
  const items = cartItems();
  if (!items.length) { closeSheet(); refresh(); return; }
  $('#sheet').innerHTML = `
    <h2>確認你的滷味</h2>
    ${items.map(([id, q]) => `
      <div class="line"><img src="${img(id)}" alt="">
        <div class="t">${ITEMS[id].name}<small>${ITEMS[id].unit}　$${ITEMS[id].price}</small></div>
        <div class="qty"><button data-d="-1" data-id="${id}">−</button><span>${q}</span><button data-d="1" data-id="${id}">＋</button></div>
      </div>`).join('')}
    <h3>配料（免費，點一下切換）</h3>
    <div class="toppings">
      <button class="top spicy ${tp.spice ? 'on' : 'off'}" data-t="spice"><img src="assets/props/chili.webp" alt="">
        ${SPICE[tp.spice]}<span class="dots">${[1, 2, 3].map(i => `<i class="${tp.spice >= i ? 'on' : ''}"></i>`).join('')}</span></button>
      <button class="top ${tp.scallion ? 'on' : 'off'}" data-t="scallion"><img src="assets/props/scallion.webp" alt="">
        蔥花<small>${tp.scallion ? '要' : '不要'}</small></button>
      <button class="top ${tp.pickles ? 'on' : 'off'}" data-t="pickles"><img src="assets/props/pickles.webp" alt="">
        酸菜<small>${tp.pickles ? '要' : '不要'}</small></button>
    </div>
    <h3>付款方式</h3>
    <div class="pay">
      ${Object.entries(PAY).map(([k, v]) => `<button data-p="${k}" class="${pay === k ? 'on' : ''}">${k === 'cash' ? '💵' : '📱'} ${v}</button>`).join('')}
    </div>
    <div class="foot">
      <div class="sum">合計 <b>$${total(items)}</b></div>
      <button class="btn ghost" id="backBtn" style="color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink)">再看看</button>
      <button class="btn" id="sendBtn">${pay === 'online' ? '前往付款' : '送出訂單'}</button>
    </div>`;

  $('#sheet').querySelectorAll('.qty button').forEach(b => b.onclick = () => {
    cart[b.dataset.id] = Math.max(0, (cart[b.dataset.id] || 0) + +b.dataset.d);
    refresh(); renderSheet();
  });
  $('#sheet').querySelectorAll('.top').forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    if (t === 'spice') tp.spice = (tp.spice + 1) % SPICE.length; else tp[t] = !tp[t];
    renderSheet();
    gsap.fromTo($(`.top[data-t="${t}"] img`), { rotation: -15, scale: 1.15 }, { rotation: 0, scale: 1, duration: .6, ease: 'elastic.out(1, .4)' });
  });
  $('#sheet').querySelectorAll('.pay button').forEach(b => b.onclick = () => { pay = b.dataset.p; renderSheet(); });
  $('#backBtn').onclick = closeSheet;
  $('#sendBtn').onclick = () => (pay === 'online' ? openPay() : submit(false));
}

// 線上付款（測試模式：模擬付款成功，正式版接金流）
function openPay() {
  const amt = total(cartItems());
  $('#sheet').innerHTML = `
    <h2>線上付款 <span class="test-tag">測試模式・不會真的扣款</span></h2>
    <p>應付金額 <b style="font-size:24px;color:var(--red)">$${amt}</b></p>
    <div class="paylist">
      <button style="background:#06c755" data-m="LINE Pay">LINE Pay</button>
      <button style="background:#d7282f" data-m="街口支付">街口支付</button>
      <button style="background:#2a3f6b" data-m="信用卡">信用卡</button>
    </div>
    <div class="foot"><button class="btn ghost" id="payBack" style="color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink)">返回</button></div>`;
  $('#payBack').onclick = renderSheet;
  $('#sheet').querySelectorAll('.paylist button').forEach(b => b.onclick = () => {
    $('#sheet').innerHTML = `<h2>${b.dataset.m} 付款中…</h2><p>請稍候</p>`;
    setTimeout(() => submit(true, b.dataset.m), 1300);
  });
}

async function submit(paid, method = '') {
  const items = cartItems();
  const order = {
    type: 'order',
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    no: String(100 + Math.floor(Math.random() * 900)),
    items, toppings: { ...tp }, pay, payMethod: method, paid, total: total(items),
  };
  $('#sheet').innerHTML = '<h2>送出中…</h2>';
  const ok = await send(order);
  if (!ok) {
    $('#sheet').innerHTML = '<h2>網路不穩，送出失敗</h2><p>請再按一次送出。</p><button class="btn" id="retry">再試一次</button>';
    $('#retry').onclick = () => submit(paid, method);
    return;
  }
  closeSheet();
  myId = order.id;
  store(KEY, myId);
  store(SEEN, null);
  orders[order.id] = orders[order.id] || { ...order, status: 'new' };
  await dropToStrainer(items);
  Object.keys(cart).forEach(k => delete cart[k]);
  refresh();
  showWait();
}

/* ── 等候畫面 ── */
let tick;
function showWait() {
  const o = orders[myId];
  if (!o) return;
  $('#menuView').classList.add('hidden');
  $('#waitView').classList.remove('hidden');
  clearInterval(tick);
  const draw = () => {
    const o = orders[myId];
    let status = '店家收到訂單，正在安排時間…';
    let ring = '';
    if (o.status === 'cooking' && o.etaAt) {
      const left = Math.max(0, o.etaAt - Date.now());
      const frac = o.eta ? left / (o.eta * 60000) : 0;
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      status = left ? `滷味煮製中，約 ${o.eta} 分鐘` : '快好了，再等一下下～';
      const C = 2 * Math.PI * 64;
      ring = `<div class="ring"><svg width="150" height="150"><circle cx="75" cy="75" r="64" stroke="#f0dcb6" stroke-width="12" fill="none"/>
        <circle cx="75" cy="75" r="64" stroke="#e8742c" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
        <div class="left"><div>${m}:${String(s).padStart(2, '0')}<small>預計剩餘</small></div></div></div>`;
    }
    if (o.status === 'done') status = '好了！請到櫃檯取餐';
    $('#waitView').innerHTML = `
      <div class="ticket">
        <div class="no">取餐號碼<b>${o.no}</b></div>
        <span class="paybadge ${o.paid ? 'paid' : 'unpaid'}">${o.paid ? '已付款' : `現場付現 $${o.total}`}</span>
        <div class="status">${status}</div>
        ${ring}
        <div class="mini">${o.items.map(([id, q]) => `<span>${ITEMS[id].name}×${q}</span>`).join('')}</div>
        <div class="mini">${[SPICE[o.toppings.spice], o.toppings.scallion && '加蔥', o.toppings.pickles && '加酸菜'].filter(Boolean).map(t => `<span>${t}</span>`).join('')}</div>
      </div>
      ${o.status === 'done'
        ? '<img class="bob" src="assets/props/bowl.webp" alt=""><button class="btn" id="again">取餐完成，再點一份</button>'
        : '<img class="bob" id="bob" src="assets/props/strainer.webp" alt="">'}`;
    const again = $('#again');
    if (again) again.onclick = () => { store(KEY, null); myId = null; clearInterval(tick); $('#waitView').classList.add('hidden'); $('#menuView').classList.remove('hidden'); };
  };
  draw();
  const bob = $('#bob');
  if (bob) gsap.to(bob, { y: 12, rotation: 3, duration: .9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  tick = setInterval(draw, 1000);
}

/* ── 收訊息 ── */
let playing = false;
async function onEvent(e) {
  const before = orders[myId]?.status;
  orders = reduce(orders, e);
  const o = orders[myId];
  if (!o || $('#waitView').classList.contains('hidden')) return;
  if (o.status === 'done' && before !== 'done' && store(SEEN) !== myId && !playing) {
    playing = true;
    store(SEEN, myId);
    clearInterval(tick);
    await pourToBowl(o);
    playing = false;
    showWait();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

renderWall();
refresh();
listen(onEvent, ok => { $('#conn').textContent = ok ? '🟢 已連線' : '🔴 重新連線中'; });

// 重新打開網頁：接回自己的訂單（等歷史事件重播完再判斷）
if (myId) {
  setTimeout(() => {
    if (orders[myId]) {
      if (orders[myId].status === 'done' && store(SEEN) !== myId) {
        store(SEEN, myId);
        $('#menuView').classList.add('hidden');
        pourToBowl(orders[myId]).then(showWait);
      } else showWait();
    }
  }, 1800);
}
