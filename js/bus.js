// 訂單訊息收送（測試版：ntfy.sh 公開頻道；正式版改 Firestore，只換這個檔）
// 事件：order（客人下單）、edit（客人在接單前修改）、eta（業者接單並設定分鐘）、paid（收到現金）、done（完成）
import { ITEMS, total } from './menu.js';

const TOPIC = new URLSearchParams(location.search).get('topic') || 'braise-order-test-7kq2vx9m';
const BASE = `https://ntfy.sh/${TOPIC}`;
const NOTE_MAX = 60;

export async function send(evt) {
  const body = JSON.stringify({ ...evt, ts: Date.now() });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE, { method: 'POST', body });
      if (r.ok) return true;
    } catch (e) { /* 重試 */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return false;
}

// 訂閱：since=12h 會先重播過去 12 小時的事件，再持續接收新事件
export function listen(onEvent, onStatus = () => {}) {
  const seen = new Set();
  let es;
  const open = () => {
    es = new EventSource(`${BASE}/sse?since=12h`);
    es.onopen = () => onStatus(true);
    es.onmessage = m => {
      try {
        const d = JSON.parse(m.data);
        if (d.event !== 'message' || seen.has(d.id)) return;
        seen.add(d.id);
        onEvent(JSON.parse(d.message));
      } catch (e) { /* 忽略非本系統訊息 */ }
    };
    es.onerror = () => onStatus(false);
  };
  open();
  return () => es && es.close();
}

// 公開頻道誰都能寫，收到的內容一律整理過：只留菜單上有的品項、配料限定範圍、備註限長
// 舊格式（一張單只有一碗：items＋toppings）也轉成 bowls
function cleanBowls(e) {
  const raw = Array.isArray(e.bowls) ? e.bowls : [{ items: e.items, toppings: e.toppings, note: '' }];
  return raw.slice(0, 8).map(b => ({
    items: (Array.isArray(b?.items) ? b.items : [])
      .filter(x => Array.isArray(x) && ITEMS[x[0]] && Number.isInteger(x[1]) && x[1] > 0 && x[1] < 100),
    toppings: {
      spice: Math.min(3, Math.max(0, b?.toppings?.spice | 0)),
      scallion: !!b?.toppings?.scallion,
      pickles: !!b?.toppings?.pickles,
    },
    note: String(b?.note || '').slice(0, NOTE_MAX),
  })).filter(b => b.items.length);
}

export const bowlsTotal = bowls => bowls.reduce((s, b) => s + total(b.items), 0);

// 客人身分：稱呼、Q 版頭像（菜單品項 id）、電話末三碼（測試期公開頻道只傳末三碼）
function cleanCustomer(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    name: String(c.name || '').slice(0, 8),
    avatar: ITEMS[c.avatar] ? c.avatar : '',
    tail: /^\d{3}$/.test(c.tail) ? c.tail : '',
  };
}

// 叫號用的稱呼：頭像品名＋稱呼，例如「鳥蛋陳小姐」
export const callName = c => (c ? `${c.avatar ? ITEMS[c.avatar].name : ''}${c.name}` : '');

// 由事件重建所有訂單狀態
export function reduce(orders, e) {
  if (!e || typeof e.id !== 'string') return orders;
  const o = orders[e.id];
  if (e.type === 'order' && !o) {
    const bowls = cleanBowls(e);
    if (!bowls.length) return orders;
    const t = bowlsTotal(bowls);
    orders[e.id] = {
      id: e.id, no: String(e.no || '').slice(0, 4), ts: e.ts, pay: e.pay === 'online' ? 'online' : 'cash',
      payMethod: String(e.payMethod || '').slice(0, 12), bowls, total: t, customer: cleanCustomer(e.customer),
      paidAmount: e.paid ? t : 0, status: 'new', eta: null, etaAt: null, rev: 0,
    };
  } else if (o) {
    if (e.type === 'edit') {
      if (o.status === 'new') {
        const bowls = cleanBowls(e);
        if (bowls.length) {
          o.bowls = bowls;
          o.total = bowlsTotal(bowls);
          if (typeof e.paidAmount === 'number') o.paidAmount = e.paidAmount;
          o.rev = e.rev; o.edited = true; o.editedAt = e.ts;
        }
      } else {
        o.rejected = e.rev;          // 店家已接單，這次修改不算數
      }
    }
    if (e.type === 'eta' && e.minutes > 0) { o.eta = e.minutes; o.etaAt = e.ts + e.minutes * 60000; if (o.status === 'new') o.status = 'cooking'; }
    if (e.type === 'paid') o.paidAmount = o.total;
    if (e.type === 'done') { o.status = 'done'; o.doneAt = e.ts; }
  }
  return orders;
}

// 付款狀態：due > 0 尚欠、= 0 已付清、< 0 多付（要退）
export const due = o => o.total - o.paidAmount;

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
