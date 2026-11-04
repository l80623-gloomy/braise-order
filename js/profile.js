// 簡單登入（不綁會員）：手機＋稱呼＋Q 版頭像，存在客人自己的手機
// 完整電話只留在本機；送給店家的只有末三碼（取餐核對用）
import { CATEGORIES, ITEMS, img } from './menu.js';
import { callName, esc } from './bus.js';

const KEY = 'braise.profile';
const TITLES = ['先生', '小姐', '不指定'];
const $ = s => document.querySelector(s);

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p && /^09\d{8}$/.test(p.phone) && ITEMS[p.avatar] ? p : null;
  } catch (e) { return null; }
}

function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 存不了就只用這一次 */ }
}

// 稱呼：暱稱優先；否則姓氏＋先生／小姐（不指定就只留姓）
const display = p => {
  if (p.useNick) return p.nick.trim();
  const s = p.surname.trim();
  return s ? s + (p.title === '不指定' ? '' : p.title) : '';   // 沒填姓就不算有稱呼
};

// 放進訂單裡的客人資料
export const customerOf = p => ({ name: display(p), avatar: p.avatar, tail: p.phone.slice(-3) });

export function openProfile(onDone, current) {
  const p = current ? { ...current } : {
    phone: '', surname: '', title: '小姐', nick: '', useNick: false,
    avatar: CATEGORIES[0].items[Math.floor(Math.random() * 13)].id,
  };
  const box = $('#login');
  box.classList.remove('hidden');

  const render = () => {
    const call = display(p) ? callName({ name: display(p), avatar: p.avatar }) : '';
    box.innerHTML = `
      <div class="login-card">
        <img class="login-hero" src="assets/props/hero.webp" alt="">
        <h2>${current ? '修改我的資料' : '歡迎光臨！先認識一下你'}</h2>
        <label for="lgPhone">📱 手機號碼</label>
        <input id="lgPhone" type="tel" inputmode="numeric" maxlength="10" placeholder="0912345678" value="${esc(p.phone)}">
        <label>🙋 怎麼稱呼你？</label>
        ${p.useNick
          ? `<input id="lgNick" maxlength="6" placeholder="暱稱，例如：阿明" value="${esc(p.nick)}">`
          : `<div class="name-row">
               <input id="lgSur" maxlength="2" placeholder="姓" value="${esc(p.surname)}">
               <div class="seg">${TITLES.map(t => `<button data-title="${t}" class="${p.title === t ? 'on' : ''}">${t}</button>`).join('')}</div>
             </div>`}
        <button class="link" id="lgToggle">${p.useNick ? '改用姓氏稱呼' : '想用暱稱？'}</button>
        <label>🥢 選一個 Q 版頭像（叫號時會用）</label>
        <div class="av-grid">
          ${Object.values(ITEMS).map(it => `<button data-av="${it.id}" class="${p.avatar === it.id ? 'on' : ''}" title="${it.name}"><img src="${img(it.id)}" alt="${it.name}" loading="lazy"></button>`).join('')}
        </div>
        <div class="call-preview">
          <img src="${img(p.avatar)}" alt="">
          <div>叫號時會叫你<b>${call ? esc(call) : '（請先填稱呼）'}</b></div>
        </div>
        <p class="err" id="lgErr"></p>
        <button class="btn" id="lgGo">${current ? '儲存' : '開始點餐'}</button>
        ${current ? '<button class="btn ghost dark" id="lgCancel">取消</button>' : ''}
        <p class="privacy">電話只用於取餐核對與記住你的口味，不會另作他用。測試期間只會把電話<b>末三碼</b>傳給店家。</p>
      </div>`;

    const phone = $('#lgPhone');
    phone.oninput = () => { p.phone = phone.value.replace(/\D/g, '').slice(0, 10); phone.value = p.phone; $('#lgErr').textContent = ''; };
    const sur = $('#lgSur'); if (sur) sur.oninput = () => { p.surname = sur.value; refreshPreview(); };
    const nick = $('#lgNick'); if (nick) nick.oninput = () => { p.nick = nick.value; refreshPreview(); };
    box.querySelectorAll('[data-title]').forEach(b => b.onclick = () => { p.title = b.dataset.title; render(); });
    $('#lgToggle').onclick = () => { p.useNick = !p.useNick; render(); };
    box.querySelectorAll('[data-av]').forEach(b => b.onclick = () => {
      p.avatar = b.dataset.av;
      box.querySelectorAll('[data-av]').forEach(x => x.classList.toggle('on', x === b));
      refreshPreview();
      window.gsap?.fromTo(b, { scale: 1.25, rotation: -10 }, { scale: 1, rotation: 0, duration: .6, ease: 'elastic.out(1, .4)' });
    });
    $('#lgGo').onclick = () => {
      const err = !/^09\d{8}$/.test(p.phone) ? '請輸入 09 開頭的 10 碼手機號碼'
        : !display(p) ? (p.useNick ? '請輸入暱稱' : '請輸入姓氏') : '';
      $('#lgErr').textContent = err;
      if (err) return;
      saveProfile(p);
      box.classList.add('hidden');
      onDone(p);
    };
    const cancel = $('#lgCancel'); if (cancel) cancel.onclick = () => box.classList.add('hidden');
  };

  // 打字時只更新預覽，不整個重畫（避免輸入框失去焦點）；有在改就先收起錯誤訊息
  const refreshPreview = () => {
    $('#lgErr').textContent = '';
    const call = display(p) ? callName({ name: display(p), avatar: p.avatar }) : '';
    box.querySelector('.call-preview').innerHTML = `<img src="${img(p.avatar)}" alt=""><div>叫號時會叫你<b>${call ? esc(call) : '（請先填稱呼）'}</b></div>`;
  };

  render();
}
