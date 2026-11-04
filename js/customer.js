// 客人端：竹牌點餐 → 配料／備註／付款 → 投入麵切 → 等候 → 倒入碗公
// 一張單可以有好幾碗（同一個取餐號碼、一次結帳）；也可以另開一張單「再點一碗」
// 店家接單（設定分鐘）之前，客人可以修改訂單
import { CATEGORIES, ITEMS, SPICE, PAY, img, total } from './menu.js';
import { send, listen, reduce, bowlsTotal, due, esc } from './bus.js';
import { dropToStrainer, pourToBowl } from './anim.js';

const $ = s => document.querySelector(s);
const gsap = window.gsap;
const KEY = 'braise.myOrders';         // 我的訂單 id 陣列
const SEEN = 'braise.seenDone';        // 已播過倒入動畫的訂單 id 陣列
const NOTE_CHIPS = ['麵煮軟一點', '醬多一點', '不要醬', '切小塊', '分開裝'];

const newBowl = () => ({ items: {}, toppings: { spice: 0, scallion: false, pickles: false }, note: '' });
const newDraft = () => ({ bowls: [newBowl()], cur: 0, editing: null });

let draft = newDraft();                // 正在點（或正在修改）的這張單
let pay = 'cash';
let orders = {};
let myIds = load(KEY);
let seen = load(SEEN);

const bowl = () => draft.bowls[draft.cur];
const pairs = items => Object.entries(items).filter(([, q]) => q > 0);
const draftBowls = () => draft.bowls
  .map(b => ({ items: pairs(b.items), toppings: { ...b.toppings }, note: b.note.trim() }))
  .filter(b => b.items.length);

function load(k) {
  try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(myIds));
    localStorage.setItem(SEEN, JSON.stringify(seen.filter(id => myIds.includes(id))));
  } catch (e) { /* 無痕模式等情況存不了，不影響本次使用 */ }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
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
    const items = bowl().items;
    items[id] = Math.max(0, (items[id] || 0) + (minus ? -1 : 1));
    gsap.fromTo(s, { rotation: minus ? 7 : -7 }, { rotation: 0, duration: .9, ease: 'elastic.out(1.2, .3)' });
    refresh();
  };
  $('#goBtn').onclick = openSheet;
  $('#myBtn').onclick = showWait;
  $('#cancelEdit').onclick = () => { draft = newDraft(); pay = 'cash'; refresh(); showWait(); };
}

function refresh() {
  const items = bowl().items;
  document.querySelectorAll('.slat').forEach(s => {
    const q = items[s.dataset.id] || 0;
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
  const cur = pairs(items);
  const n = draft.bowls.length;
  $('#bowlLbl').textContent = n > 1 ? `第 ${draft.cur + 1} 碗　` : '';
  $('#cnt').textContent = cur.reduce((s, [, q]) => s + q, 0);
  $('#tot').textContent = total(cur);
  const filled = draftBowls();
  $('#allTot').textContent = n > 1 ? `　整單 ${filled.length} 碗 $${bowlsTotal(filled)}` : '';
  $('#goBtn').disabled = !draftBowls().length && !draft.editing;
  $('#goBtn').textContent = draft.editing ? '檢查修改' : '下鍋！';
  const ed = draft.editing && orders[draft.editing];
  $('#editBar').classList.toggle('hidden', !ed);
  if (ed) $('#editTxt').textContent = `✏️ 正在修改 ${ed.no} 號訂單`;
  refreshMyBtn();
}

// 竹牌頁上方的「我的訂單」按鈕：有訂單才出現，有好了的會變綠色
function refreshMyBtn() {
  const mine = myIds.map(id => orders[id]).filter(Boolean);
  const b = $('#myBtn');
  b.classList.toggle('hidden', !mine.length || !!draft.editing);
  const ready = mine.filter(o => o.status === 'done').length;
  b.classList.toggle('ready', ready > 0);
  b.textContent = ready ? `🍜 ${ready} 張單好了，去取餐` : `🧾 我的訂單（${mine.length}）`;
}

/* ── 確認面板：每一碗的品項、配料、備註，以及付款 ── */
function openSheet() {
  $('#sheetBg').classList.remove('hidden');
  renderSheet();
}
function closeSheet() { $('#sheetBg').classList.add('hidden'); }
$('#sheetBg').onclick = e => { if (e.target.id === 'sheetBg') closeSheet(); };

function renderSheet() {
  const b = bowl();
  const cur = pairs(b.items);
  const n = draft.bowls.length;
  const ed = draft.editing && orders[draft.editing];
  const all = draftBowls();
  const sum = bowlsTotal(all);
  $('#sheet').innerHTML = `
    <h2>${ed ? `修改 ${ed.no} 號訂單` : '確認你的滷味'}</h2>
    <div class="bowl-tabs">
      ${draft.bowls.map((bw, i) => `<button class="bt ${i === draft.cur ? 'on' : ''}" data-b="${i}">第 ${i + 1} 碗<small>$${total(pairs(bw.items))}</small></button>`).join('')}
      ${n < 8 ? '<button class="bt add" id="addBowl">＋ 同一張單<br>再加一碗</button>' : ''}
    </div>
    ${cur.length ? cur.map(([id, q]) => `
      <div class="line"><img src="${img(id)}" alt="">
        <div class="t">${ITEMS[id].name}<small>${ITEMS[id].unit}　$${ITEMS[id].price}</small></div>
        <div class="qty"><button data-d="-1" data-id="${id}">−</button><span>${q}</span><button data-d="1" data-id="${id}">＋</button></div>
      </div>`).join('') : '<p class="empty">這一碗還沒選料</p>'}
    <button class="btn ghost dark more" id="pickMore">＋ 回竹牌挑${n > 1 ? `第 ${draft.cur + 1} 碗` : ''}的料</button>
    <h3>配料（免費，點一下切換）</h3>
    <div class="toppings">
      <button class="top spicy ${b.toppings.spice ? 'on' : 'off'}" data-t="spice"><img src="assets/props/chili.webp" alt="">
        ${SPICE[b.toppings.spice]}<span class="dots">${[1, 2, 3].map(i => `<i class="${b.toppings.spice >= i ? 'on' : ''}"></i>`).join('')}</span></button>
      <button class="top ${b.toppings.scallion ? 'on' : 'off'}" data-t="scallion"><img src="assets/props/scallion.webp" alt="">
        蔥花<small>${b.toppings.scallion ? '要' : '不要'}</small></button>
      <button class="top ${b.toppings.pickles ? 'on' : 'off'}" data-t="pickles"><img src="assets/props/pickles.webp" alt="">
        酸菜<small>${b.toppings.pickles ? '要' : '不要'}</small></button>
    </div>
    <h3>備註${n > 1 ? `（第 ${draft.cur + 1} 碗）` : ''}</h3>
    <textarea class="note-box" id="noteBox" maxlength="60" rows="2" placeholder="想跟老闆說的話，例如：麵煮軟一點">${esc(b.note)}</textarea>
    <div class="chips">${NOTE_CHIPS.map(c => `<button data-chip="${c}">${c}</button>`).join('')}</div>
    ${n > 1 ? `<button class="link-del" id="delBowl">刪除第 ${draft.cur + 1} 碗</button>` : ''}
    <h3>付款方式</h3>
    ${ed
      ? `<p class="pay-info">${PAY[ed.pay]}${ed.paidAmount ? `（已付 $${ed.paidAmount}）` : ''}</p>`
      : `<div class="pay">${Object.entries(PAY).map(([k, v]) => `<button data-p="${k}" class="${pay === k ? 'on' : ''}">${k === 'cash' ? '💵' : '📱'} ${v}</button>`).join('')}</div>`}
    <div class="foot">
      <div class="sum">${n > 1 ? `整單 ${all.length} 碗` : '合計'} <b>$${sum}</b></div>
      <button class="btn ghost dark" id="backBtn">再看看</button>
      <button class="btn" id="sendBtn" ${all.length ? '' : 'disabled'}>${ed ? '送出修改' : pay === 'online' ? '前往付款' : '送出訂單'}</button>
    </div>`;

  const sh = $('#sheet');
  sh.querySelectorAll('.qty button').forEach(x => x.onclick = () => {
    b.items[x.dataset.id] = Math.max(0, (b.items[x.dataset.id] || 0) + +x.dataset.d);
    refresh(); renderSheet();
  });
  sh.querySelectorAll('.bt[data-b]').forEach(x => x.onclick = () => { draft.cur = +x.dataset.b; refresh(); renderSheet(); });
  const add = $('#addBowl');
  if (add) add.onclick = () => {
    draft.bowls.push(newBowl());
    draft.cur = draft.bowls.length - 1;
    closeSheet(); refresh();
    toast(`開始點第 ${draft.cur + 1} 碗，挑好再按「${draft.editing ? '檢查修改' : '下鍋！'}」`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#pickMore').onclick = () => { closeSheet(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  sh.querySelectorAll('.top').forEach(x => x.onclick = () => {
    const t = x.dataset.t;
    if (t === 'spice') b.toppings.spice = (b.toppings.spice + 1) % SPICE.length; else b.toppings[t] = !b.toppings[t];
    renderSheet();
    gsap.fromTo($(`.top[data-t="${t}"] img`), { rotation: -15, scale: 1.15 }, { rotation: 0, scale: 1, duration: .6, ease: 'elastic.out(1, .4)' });
  });
  $('#noteBox').oninput = e => { b.note = e.target.value; };
  sh.querySelectorAll('[data-chip]').forEach(x => x.onclick = () => {
    const c = x.dataset.chip;
    if (!b.note.includes(c)) b.note = (b.note.trim() ? b.note.trim() + '、' : '') + c;
    b.note = b.note.slice(0, 60);
    $('#noteBox').value = b.note;
  });
  const del = $('#delBowl');
  if (del) del.onclick = () => {
    draft.bowls.splice(draft.cur, 1);
    draft.cur = Math.min(draft.cur, draft.bowls.length - 1);
    refresh(); renderSheet();
  };
  sh.querySelectorAll('.pay button').forEach(x => x.onclick = () => { pay = x.dataset.p; renderSheet(); });
  $('#backBtn').onclick = closeSheet;
  $('#sendBtn').onclick = () => {
    if (draft.editing) return submitEdit();
    if (pay === 'online') return openPay(sum, '線上付款', m => submitOrder(true, m));
    submitOrder(false);
  };
}

// 線上付款（測試模式：模擬付款成功，正式版接金流）
function openPay(amount, title, onPaid) {
  $('#sheet').innerHTML = `
    <h2>${title} <span class="test-tag">測試模式・不會真的扣款</span></h2>
    <p>應付金額 <b style="font-size:24px;color:var(--red)">$${amount}</b></p>
    <div class="paylist">
      <button style="background:#06c755" data-m="LINE Pay">LINE Pay</button>
      <button style="background:#d7282f" data-m="街口支付">街口支付</button>
      <button style="background:#2a3f6b" data-m="信用卡">信用卡</button>
    </div>
    <div class="foot"><button class="btn ghost dark" id="payBack">返回</button></div>`;
  $('#payBack').onclick = renderSheet;
  $('#sheet').querySelectorAll('.paylist button').forEach(b => b.onclick = () => {
    $('#sheet').innerHTML = `<h2>${b.dataset.m} 付款中…</h2><p>請稍候</p>`;
    setTimeout(() => onPaid(b.dataset.m), 1300);
  });
}

async function sendOrFail(ev, retry) {
  $('#sheet').innerHTML = '<h2>送出中…</h2>';
  if (await send(ev)) return true;
  $('#sheet').innerHTML = '<h2>網路不穩，送出失敗</h2><p>請再按一次送出。</p><button class="btn" id="retry">再試一次</button>';
  $('#retry').onclick = retry;
  return false;
}

async function submitOrder(paid, method = '') {
  const bowls = draftBowls();
  const order = {
    type: 'order',
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    no: String(100 + Math.floor(Math.random() * 900)),
    bowls, pay, payMethod: method, paid,
  };
  if (!(await sendOrFail(order, () => submitOrder(paid, method)))) return;
  closeSheet();
  myIds.push(order.id);
  save();
  orders = reduce(orders, { ...order, ts: Date.now() });
  draft = newDraft();
  pay = 'cash';
  refresh();
  await dropToStrainer(bowls.flatMap(b => b.items));   // 整張單的料一起下鍋
  showWait();
}

function submitEdit() {
  const o = orders[draft.editing];
  if (!o || o.status !== 'new') {
    closeSheet();
    toast('店家已經接單了，沒辦法再修改，請直接告訴店家');
    draft = newDraft(); refresh(); showWait();
    return;
  }
  const bowls = draftBowls();
  const newTotal = bowlsTotal(bowls);
  const diff = newTotal - o.paidAmount;
  const go = async paidAmount => {
    const ev = { type: 'edit', id: o.id, rev: (o.rev || 0) + 1, bowls };
    if (paidAmount !== undefined) ev.paidAmount = paidAmount;
    if (!(await sendOrFail(ev, () => go(paidAmount)))) return;
    closeSheet();
    draft = newDraft(); pay = 'cash'; refresh(); showWait();
    toast(diff < 0 && o.pay === 'online' ? `修改已送出，多付的 $${-diff} 將退回（測試模式）` : '修改已送出');
  };
  if (o.pay === 'online' && diff > 0) openPay(diff, '補付差額', () => go(newTotal));
  else go(o.pay === 'online' ? newTotal : undefined);
}

function startEdit(id) {
  const o = orders[id];
  if (!o || o.status !== 'new') { toast('店家已經接單了，沒辦法再修改'); return; }
  draft = {
    bowls: o.bowls.map(b => ({ items: Object.fromEntries(b.items), toppings: { ...b.toppings }, note: b.note })),
    cur: 0, editing: id,
  };
  pay = o.pay;
  showMenu();
  toast(`正在修改 ${o.no} 號訂單，改好按「檢查修改」`);
}

/* ── 等候畫面：列出我的每一張單 ── */
let tick;
const C = 2 * Math.PI * 52;

function payBadge(o) {
  const d = due(o);
  if (o.paidAmount && d <= 0) return `<span class="paybadge paid">已付款${d < 0 ? `・將退 $${-d}` : ''}</span>`;
  if (o.paidAmount) return `<span class="paybadge unpaid">已付 $${o.paidAmount}・尚需補 $${d}</span>`;
  return `<span class="paybadge unpaid">現場付現 $${o.total}</span>`;
}

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
  const many = o.bowls.length > 1;
  return `
    <div class="ticket ${done ? 'done' : ''}">
      <div class="no">取餐號碼<b>${esc(o.no)}</b>${many ? `<span class="nb">共 ${o.bowls.length} 碗</span>` : ''}</div>
      ${payBadge(o)}
      <div class="status">${status}</div>
      ${ring}
      ${o.bowls.map((b, i) => `
        <div class="bowl-sum">
          ${many ? `<div class="bh">第 ${i + 1} 碗</div>` : ''}
          <div class="mini">${b.items.map(([id, q]) => `<span>${ITEMS[id].name}×${q}</span>`).join('')}</div>
          <div class="mini">${[SPICE[b.toppings.spice], b.toppings.scallion && '加蔥', b.toppings.pickles && '加酸菜'].filter(Boolean).map(t => `<span>${t}</span>`).join('')}</div>
          ${b.note ? `<div class="note">📝 ${esc(b.note)}</div>` : ''}
        </div>`).join('')}
      ${o.status === 'new' ? `<button class="btn ghost dark" data-edit="${o.id}">✏️ 修改訂單</button><div class="hint">店家接單前都可以修改</div>` : ''}
      ${done ? `<button class="btn green" data-pick="${o.id}">已取餐</button>` : ''}
    </div>`;
}

function mine() { return myIds.map(id => orders[id]).filter(Boolean).reverse(); }

function drawWait() {
  const list = mine();
  if (!list.length) { showMenu(); return; }
  const cooking = list.some(o => o.status !== 'done');
  $('#waitView').innerHTML = `
    <div class="wait-top"><button class="btn" id="againBtn">＋ 再點一碗（另開一張單）</button></div>
    <div id="tickets">${list.map(ticket).join('')}</div>
    ${cooking ? '<img class="bob" id="bob" src="assets/props/strainer.webp" alt="">' : ''}`;
  const bob = $('#bob');
  if (bob) gsap.to(bob, { y: 12, rotation: 3, duration: .9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
}

$('#waitView').onclick = e => {
  if (e.target.closest('#againBtn')) { draft = newDraft(); pay = 'cash'; showMenu(); return; }
  const p = e.target.closest('[data-pick]');
  if (p) { myIds = myIds.filter(id => id !== p.dataset.pick); save(); drawWait(); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) startEdit(ed.dataset.edit);
};

function showWait() {
  if (!mine().length) return;
  $('#menuView').classList.add('hidden');
  $('#waitView').classList.remove('hidden');
  window.scrollTo(0, 0);
  drawWait();
  clearInterval(tick);
  // 每秒只更新有變的票卡，不整頁重畫（避免浮動的麵切動畫一直重來）
  tick = setInterval(() => {
    const list = mine();
    const els = $('#tickets')?.children;
    if (!els || els.length !== list.length) return drawWait();
    list.forEach((o, i) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = ticket(o);
      if (els[i].innerHTML !== tmp.firstElementChild.innerHTML) els[i].replaceWith(tmp.firstElementChild);
    });
  }, 1000);
}

function showMenu() {
  clearInterval(tick);
  $('#waitView').classList.add('hidden');
  $('#menuView').classList.remove('hidden');
  refresh();
}

/* ── 收訊息：我的單好了就播倒入碗公，一碗一次（多碗依序播） ── */
let playing = false;
const queue = [];

async function playQueue() {
  if (playing) return;
  playing = true;
  while (queue.length) {
    clearInterval(tick);
    await pourToBowl(queue.shift());
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  playing = false;
  if (!draft.editing && !$('#waitView').classList.contains('hidden')) showWait();
  else refresh();
}

function checkDone() {
  for (const id of myIds) {
    const o = orders[id];
    if (o && o.status === 'done' && !seen.includes(id)) {
      seen.push(id);
      const n = o.bowls.length;
      o.bowls.forEach((b, i) => queue.push({ no: o.no, items: b.items, toppings: b.toppings, label: n > 1 ? `第 ${i + 1}/${n} 碗` : '' }));
    }
  }
  save();
  if (queue.length) playQueue();
}

let replayed = false;                  // 歷史事件重播完之前先不判斷
function onEvent(e) {
  orders = reduce(orders, e);
  if (!replayed || !myIds.includes(e.id)) return;
  const o = orders[e.id];
  if (e.type === 'edit' && o) {
    if (o.rejected === e.rev) toast('店家剛好已經接單，這次修改沒有成功，請直接告訴店家');
    else if (o.rev === e.rev) toast('✅ 訂單已更新');
  }
  if (e.type === 'eta' && draft.editing === e.id) {
    draft = newDraft(); refresh(); showWait();
    toast('店家已經接單，修改取消，請直接告訴店家');
  }
  refreshMyBtn();
  if (e.type === 'done') checkDone();
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
