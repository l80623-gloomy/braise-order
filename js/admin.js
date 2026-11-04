// 業者端：新訂單 → 設定分鐘（製作中）→ 完成訂單
import { ITEMS, SPICE, img } from './menu.js';
import { send, listen, reduce, due, esc, callName } from './bus.js';

const $ = s => document.querySelector(s);
let orders = {};
let ready = false;      // 歷史事件重播完之前不響鈴
let audio;
const fresh = new Set();

const customerUrl = new URL('./', location.href).href;
new window.QRCode($('#qr'), { text: customerUrl, width: 192, height: 192 });

$('#startBtn').onclick = () => {
  audio = new (window.AudioContext || window.webkitAudioContext)();
  // iPad／手機要在點擊當下先「講」一次，之後才准自動語音叫號
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  $('#start').remove();
};

function ding() {
  if (!audio) return;
  [880, 1320].forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = f; o.connect(g); g.connect(audio.destination);
    const t = audio.currentTime + i * .18;
    g.gain.setValueAtTime(.4, t); g.gain.exponentialRampToValueAtTime(.001, t + .5);
    o.start(t); o.stop(t + .5);
  });
}

const hhmm = ts => new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

function bowlHtml(b, i, n) {
  const t = b.toppings;
  const tags = [
    `<span class="tag ${t.spice ? 'spice' : 'mild'}">🌶 ${SPICE[t.spice]}</span>`,
    t.scallion && '<span class="tag yes">＋蔥花</span>',
    t.pickles && '<span class="tag yes">＋酸菜</span>',
  ].filter(Boolean).join('');
  return `<div class="bowl-box">
    ${n > 1 ? `<div class="bh">🥣 第 ${i + 1} 碗</div>` : ''}
    <ul>${b.items.map(([id, q]) => `<li><img src="${img(id)}" alt="">${ITEMS[id].name}<b>×${q}</b></li>`).join('')}</ul>
    <div class="tags">${tags}</div>
    ${b.note ? `<div class="note">📝 ${esc(b.note)}</div>` : ''}
  </div>`;
}

function payTag(o) {
  const d = due(o);
  if (o.paidAmount && d < 0) return `<span class="paybadge refund">已付 $${o.paidAmount}・需退 $${-d}</span>`;
  if (o.paidAmount && d === 0) return `<span class="paybadge paid">已付 ${esc(o.payMethod)}</span>`;
  if (o.paidAmount) return `<span class="paybadge unpaid">已付 $${o.paidAmount}・尚欠 $${d}</span>`;
  return `<span class="paybadge unpaid">現金未收 $${o.total}</span>`;
}

function card(o) {
  let eta = '', acts = '';
  if (o.status === 'new') {
    acts = [5, 10, 15].map(m => `<button class="btn" data-a="eta" data-m="${m}">${m} 分</button>`).join('') +
      `<button class="btn ghost" data-a="custom">自訂</button>`;
  } else if (o.status === 'cooking') {
    const left = o.etaAt - Date.now();
    const m = Math.ceil(Math.abs(left) / 60000);
    eta = `<div class="eta ${left < 0 ? 'late' : ''}">${left < 0 ? `⚠️ 已超時 ${m} 分` : `⏱ 剩約 ${m} 分（${hhmm(o.etaAt)} 取餐）`}</div>`;
    acts = `<button class="btn green" data-a="done">完成訂單</button>`;
  } else {
    eta = `<div class="eta">完成於 ${hhmm(o.doneAt)}</div>`;
    acts = `<button class="btn ghost dark" data-a="call">🔊 再叫一次</button>`;
  }
  if (due(o) > 0) acts += `<button class="btn blue" data-a="paid">收到現金</button>`;
  const n = o.bowls.length;
  const c = o.customer;
  return `<div class="card ${fresh.has(o.id) ? 'fresh' : ''}" data-id="${esc(o.id)}">
    <div class="hd"><b>${esc(o.no)}</b><span class="tm">${hhmm(o.ts)} 下單${n > 1 ? `・<strong>${n} 碗</strong>` : ''}</span><b style="font-size:20px;color:var(--ink)">$${o.total}</b></div>
    ${c ? `<div class="who">${c.avatar ? `<img src="${img(c.avatar)}" alt="">` : ''}<span>${esc(callName(c))}</span>${c.tail ? `<small>電話末三碼 <b>${c.tail}</b></small>` : ''}</div>` : ''}
    <div>${payTag(o)}${o.edited ? `<span class="paybadge edited">✏️ 客人已修改 ${hhmm(o.editedAt)}</span>` : ''}</div>
    ${o.bowls.map((b, i) => bowlHtml(b, i, n)).join('')}
    ${eta}
    <div class="acts">${acts}</div>
  </div>`;
}

function render() {
  const list = Object.values(orders);
  for (const st of ['new', 'cooking', 'done']) {
    let l = list.filter(o => o.status === st);
    l.sort((a, b) => st === 'done' ? b.doneAt - a.doneAt : a.ts - b.ts);
    if (st === 'done') l = l.slice(0, 20);
    $('#n-' + st).textContent = list.filter(o => o.status === st).length;
    $('#c-' + st).innerHTML = l.map(card).join('');
  }
  fresh.clear();
}

document.querySelector('.board').onclick = async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const id = b.closest('.card').dataset.id;
  const a = b.dataset.a;
  let ev;
  if (a === 'eta') ev = { type: 'eta', id, minutes: +b.dataset.m };
  if (a === 'custom') {
    const m = parseInt(prompt('幾分鐘後取餐？', '20'), 10);
    if (!(m > 0)) return;
    ev = { type: 'eta', id, minutes: m };
  }
  if (a === 'call') { announce(orders[id]); return; }
  if (a === 'done') ev = { type: 'done', id };
  if (a === 'paid') ev = { type: 'paid', id };
  b.disabled = true;
  if (!(await send(ev))) { alert('網路不穩，請再按一次'); b.disabled = false; return; }
  if (a === 'done' && $('#autoCall').checked) announce(orders[id]);
};

/* ── 語音叫號：「二一四號，陳小姐，您的滷味好囉！」
   喇叭現場客人都聽得到，所以只念一般稱呼；Q 版叫法（鳥蛋陳小姐）只顯示在卡片上 ── */
const DIGIT = '零一二三四五六七八九';
function announce(o) {
  if (!o || !('speechSynthesis' in window)) return;
  const no = String(o.no).split('').map(d => DIGIT[d] ?? d).join('');
  const who = o.customer?.name || '';
  const u = new SpeechSynthesisUtterance(`${no}號，${who ? who + '，' : ''}您的滷味好囉！`);
  u.lang = 'zh-TW';
  u.rate = .95;
  const v = speechSynthesis.getVoices().find(x => x.lang === 'zh-TW') || speechSynthesis.getVoices().find(x => x.lang.startsWith('zh'));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

listen(e => {
  const isNew = e.type === 'order' && !orders[e.id];
  const before = orders[e.id]?.rev;
  orders = reduce(orders, e);
  const edited = e.type === 'edit' && orders[e.id] && orders[e.id].rev !== before;
  if ((isNew || edited) && orders[e.id] && ready) { fresh.add(e.id); ding(); }
  render();
}, ok => { $('#conn').textContent = ok ? '🟢 已連線' : '🔴 重新連線中'; });

setTimeout(() => { ready = true; }, 2500);
setInterval(render, 20000);
render();
