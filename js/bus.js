// 訂單訊息收送（測試版：ntfy.sh 公開頻道；正式版改 Firestore，只換這個檔）
// 事件：order（客人下單）、eta（業者設定分鐘）、paid（收到現金）、done（完成）
const TOPIC = new URLSearchParams(location.search).get('topic') || 'braise-order-test-7kq2vx9m';
const BASE = `https://ntfy.sh/${TOPIC}`;

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

// 由事件重建所有訂單狀態
export function reduce(orders, e) {
  if (e.type === 'order') {
    if (!orders[e.id]) orders[e.id] = { ...e, status: 'new', eta: null, etaAt: null };
  } else if (orders[e.id]) {
    const o = orders[e.id];
    if (e.type === 'eta') { o.eta = e.minutes; o.etaAt = e.ts + e.minutes * 60000; if (o.status === 'new') o.status = 'cooking'; }
    if (e.type === 'paid') o.paid = true;
    if (e.type === 'done') { o.status = 'done'; o.doneAt = e.ts; }
  }
  return orders;
}
