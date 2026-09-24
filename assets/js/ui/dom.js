// 小工具：建立元素、共用狀態訊息／錯誤訊息播報。
// 規則：更新畫面只換變動的節點，不整頁重繪；狀態訊息先清空再於下個 tick 寫入，讓重複內容也會被唸出。

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') {
      node.className = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === '') continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

// 寫入 #status（role="status"）。先清空再於下一個 tick 寫入，讓相同訊息也會被螢幕報讀器再唸一次。
export function announce(message, statusId = 'status') {
  const status = document.getElementById(statusId);
  if (!status) return;
  status.textContent = '';
  window.setTimeout(() => {
    status.textContent = message;
  }, 0);
}

// 寫入 role="alert" 的錯誤區。同樣先清空再寫入。
export function showError(message, errorId = 'error') {
  const target = document.getElementById(errorId);
  if (!target) return;
  target.textContent = '';
  window.setTimeout(() => {
    target.textContent = message;
  }, 0);
}

export function clearError(errorId = 'error') {
  const target = document.getElementById(errorId);
  if (target) target.textContent = '';
}

// 隱藏靜態的「資料載入中…」文字（ACCESSIBILITY §4 里程碑審查修正 S2）。
// 載入成功或失敗都要呼叫；失敗時緊接著呼叫 showError() 顯示錯誤訊息。
export function hideLoading(loadingId = 'loading') {
  const target = document.getElementById(loadingId);
  if (target) target.hidden = true;
}

// 停止操作一段時間後才執行一次（A1：避免 select 用方向鍵瀏覽選項、或輸入框每個字都觸發篩選與播報）。
export function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---------- 處理中狀態（ACCESSIBILITY §4，里程碑審查決議） ----------
// 不使用 disabled（會讓按鈕失焦）；改用 aria-disabled + class，click 處理函式在忙碌時直接 return。

export function setBusy(button) {
  button.setAttribute('aria-disabled', 'true');
  button.classList.add('is-busy');
}

export function clearBusy(button) {
  button.removeAttribute('aria-disabled');
  button.classList.remove('is-busy');
}

export function isBusy(button) {
  return button.getAttribute('aria-disabled') === 'true';
}

// 給會換頁或需要暫時顯示「處理中…」文字的表單送出按鈕用；短操作（選擇/取消、暫停/恢復）不要用這個，
// 忙碌時不換文字，見 setBusy。回傳的 restore() 不呼叫 focus()，因為 aria-disabled 不會讓按鈕失焦。
export function setBusyText(button, busyText) {
  const original = button.textContent;
  setBusy(button);
  button.textContent = busyText;
  return function restore(finalText) {
    clearBusy(button);
    button.textContent = finalText !== undefined ? finalText : original;
  };
}
