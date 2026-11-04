// 客人端：竹牌點餐 → 配料／付款 → 投入麵切 → 等候 → 倒入碗公
// 一位客人可以點好幾碗，每碗各自一個取餐號碼、各自播倒入碗公動畫
import { CATEGORIES, ITEMS, SPICE, PAY, img, total } from './menu.js';
import { send, listen, reduce } from './bus.js';
import { dropToStrainer, pourToBowl } from './anim.js';

const $ = s => document.querySelector(s);
const gsap = window.gsap;
const KEY = 'braise.myOrders';         // 我的訂單 id 陣列
const SEEN = 'braise.seenDone';        // 已播過倒入動畫的訂單 id 陣列

const cart = {};                       // id → 數量
const tp = { spice: 0, scallion: false, pickles: false };
let pay = 'cash';
let orders = {};
let myIds = load(KEY);
let seen = load(SEEN);

function load(k) {
  try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(myIds));
    localStorage.setItem(SEEN, JSON.stringify(seen.filter(id => myIds.includes(id))));
  } catch (e) { /* 無痕模式等情況存不了，不影響本次使用 */ }
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
    const id = s.dataset.id;
    const minus = e.target.closest('.minus');
    cart[id] = Math.max(0, (cart[id] || 0) + (minus ? -1 : 1));
    gsap.fromTo(s, { rotation: minus ? 7 : -7 }, { rotation: 0, duration: .9, ease: 'elastic.out(1.2, .3)' });
    refresh();
  };
  $('#goBtn').onclick = openSheet;
  $('#myBtn').onclick = showWait;
}

function cartItems() { return Object.entries(cart).filter(([, q]) => q > 0); }

function refresh() {
  document.querySelectorAll('.slat').forEach(s => {
    const q = cart[s.dataset.id] || 0;
    s.classList.toggle('picked', q > 0);
    let k = s.querySelector('.knot');
    if (q && !k) {
      k = document.createElement('span'); k.className = 'knot'; s.appendChild(k);
      const m = document.createElement('span'); m.className = 'minus'; m.textContent = '−'; m.setAttribute('aria-label', '減少一份'); s.appendChild(m);
    }
    if (k) {
      if (q) k.textContent = q;
      else { k.remove(); s.querySelector('.minus')?.remove(); }
    }
  });
  const items = cartItems();
  $('#cnt').textContent = items.reduce((s, [, q]) => s + q, 0);
  $('#tot').textContent = total(items);
  $('#goBtn').disabled = !items.length;
  refreshMyBtn();
}

// 竹牌頁上方的「我的訂單」按鈕：有訂單才出現，有好了的會變綠色
function refreshMyBtn() {
  const mine = myIds.map(id => orders[id]).filter(Boolean);
  const b = $('#myBtn');
  b.classList.toggle('hidden', !mine.length);
  const ready = mine.filter(o => o.status === 'done').length;
  b.classList.toggle('ready', ready > 0);
  b.textContent = ready ? `🍜 ${ready} 碗好了，去取餐` : `🧾 我的訂單（${mine.length}）`;
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
  myIds.push(order.id);
  save();
  orders[order.id] = orders[order.id] || { ...order, status: 'new' };
  await dropToStrainer(items);
  // 清空購物籃與配料，下一碗從頭選
  Object.keys(cart).forEach(k => delete cart[k]);
  Object.assign(tp, { spice: 0, scallion: false, pickles: false });
  refresh();
  showWait();
}

/* ── 等候畫面：列出我的每一碗 ── */
let tick;
const C = 2 * Math.PI * 52;

function ticket(o) {
  let status = '店家收到訂單，正在安排時間…';
  let ring = '';
  if (o.status === 'cooking' && o.etaAt) {
    const left = Math.max(0, o.etaAt - Date.now());
    const frac = o.eta ? left / (o.eta * 60000) : 0;
    const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    status = left ? `滷味煮製中，約 ${o.eta} 分鐘` : '快好了，再等一下下～';
    ring = `<div class="ring"><svg width="124" height="124"><circle cx="62" cy="62" r="52" stroke="#f0dcb6" stroke-width="10" fill="none"/>
      <circle cx="62" cy="62" r="52" stroke="#e8742c" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
      <div class="left"><div>${m}:${String(s).padStart(2, '0')}<small>預計剩餘</small></div></div></div>`;
  }
  const done = o.status === 'done';
  if (done) status = '好了！請到櫃檯取餐';
  return `
    <div class="ticket ${done ? 'done' : ''}">
      <div class="no">取餐號碼<b>${o.no}</b></div>
      <span class="paybadge ${o.paid ? 'paid' : 'unpaid'}">${o.paid ? '已付款' : `現場付現 $${o.total}`}</span>
      <div class="status">${status}</div>
      ${ring}
      <div class="mini">${o.items.map(([id, q]) => `<span>${ITEMS[id].name}×${q}</span>`).join('')}</div>
      <div class="mini">${[SPICE[o.toppings.spice], o.toppings.scallion && '加蔥', o.toppings.pickles && '加酸菜'].filter(Boolean).map(t => `<span>${t}</span>`).join('')}</div>
      ${done ? `<button class="btn green" data-pick="${o.id}">已取餐</button>` : ''}
    </div>`;
}

function drawWait() {
  const mine = myIds.map(id => orders[id]).filter(Boolean).reverse();
  if (!mine.length) { showMenu(); return; }
  const cooking = mine.some(o => o.status !== 'done');
  $('#waitView').innerHTML = `
    <div class="wait-top">
      <button class="btn" id="againBtn">＋ 再點一碗</button>
    </div>
    ${mine.map(ticket).join('')}
    ${cooking ? '<img class="bob" id="bob" src="assets/props/strainer.webp" alt="">' : ''}`;
  $('#againBtn').onclick = showMenu;
  $('#waitView').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    myIds = myIds.filter(id => id !== b.dataset.pick);
    save();
    drawWait();
  });
  const bob = $('#bob');
  if (bob) gsap.to(bob, { y: 12, rotation: 3, duration: .9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
}

function showWait() {
  if (!myIds.some(id => orders[id])) return;
  $('#menuView').classList.add('hidden');
  $('#waitView').classList.remove('hidden');
  window.scrollTo(0, 0);
  drawWait();
  clearInterval(tick);
  // 每秒只更新倒數數字與圓環，不整頁重畫（避免浮動的麵切動畫一直重來）
  tick = setInterval(() => {
    const mine = myIds.map(id => orders[id]).filter(Boolean).reverse();
    const els = $('#waitView').querySelectorAll('.ticket');
    if (els.length !== mine.length) return drawWait();
    mine.forEach((o, i) => {
      const old = els[i];
      const tmp = document.createElement('div');
      tmp.innerHTML = ticket(o);
      if (old.innerHTML !== tmp.firstElementChild.innerHTML) old.replaceWith(tmp.firstElementChild);
    });
    $('#waitView').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      myIds = myIds.filter(id => id !== b.dataset.pick);
      save();
      drawWait();
    });
  }, 1000);
}

function showMenu() {
  clearInterval(tick);
  $('#waitView').classList.add('hidden');
  $('#menuView').classList.remove('hidden');
  refresh();
}

/* ── 收訊息：我的某一碗好了就播倒入碗公（多碗同時好了就依序播） ── */
let playing = false;
const queue = [];

async function playQueue() {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const o = orders[queue.shift()];
    clearInterval(tick);
    await pourToBowl(o);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  playing = false;
  showWait();
}

function checkDone() {
  for (const id of myIds) {
    const o = orders[id];
    if (o && o.status === 'done' && !seen.includes(id)) {
      seen.push(id);
      queue.push(id);
    }
  }
  save();
  if (queue.length) playQueue();
}

let replayed = false;                  // 歷史事件重播完之前先不判斷
function onEvent(e) {
  orders = reduce(orders, e);
  if (!replayed) return;
  refreshMyBtn();
  if (myIds.includes(e.id) && e.type === 'done') checkDone();
}

renderWall();
refresh();
listen(onEvent, ok => { $('#conn').textContent = ok ? '🟢 已連線' : '🔴 重新連線中'; });

// 重新打開網頁：等歷史事件重播完，接回自己的訂單（已過期的訂單自動清掉）
setTimeout(() => {
  replayed = true;
  if (Object.keys(orders).length) myIds = myIds.filter(id => orders[id]);   // 有收到歷史才清，避免網路慢時誤刪
  save();
  refresh();
  if (myIds.length) { showWait(); checkDone(); }
}, 1800);
