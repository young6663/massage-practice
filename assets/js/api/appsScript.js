// appsScript 後端：呼叫部署好的 Google Apps Script 網路應用程式。
// 介面與 local.js 完全相同（見 docs/PROJECT_SPEC.md §7）；錯誤慣例也相同：
// 失敗時 throw { ok: false, code, message }，message 為可直接顯示的繁體中文。
//
// 通行碼不由頁面傳入（verifyAccess 除外），而是每次呼叫都從 ui/session.js 取出目前裝置已驗證的通行碼，
// 這樣頁面程式碼完全不用管通行碼，符合 docs/PROJECT_SPEC.md §6「所有 API 呼叫（含讀取）都要帶通行碼」。
import { config } from '../config.js';
import { getStoredAccessCode, clearIdentity } from '../ui/session.js';

const TIMEOUT_MS = 20000;

function fail(code, message) {
  const err = { ok: false, code, message };
  throw err;
}

// 通行碼失效時（伺服器回傳 ACCESS_DENIED）：清掉這台裝置存的身份與通行碼，
// 這樣使用者下次打開 who.html 會自動要求重新輸入通行碼；每頁頁首都有「切換身份」連結可到 who.html。
function handleAccessDenied() {
  clearIdentity();
  fail('ACCESS_DENIED', '通行碼已失效，請按頁首的「切換身份」，重新輸入群組通行碼。');
}

async function callAction(action, payload, explicitAccessCode) {
  // 用 getStoredAccessCode()（不是 getIdentity()）：通行碼驗證成功、但還沒選擇「你是誰」之前
  // （who.html 流程中）也要能呼叫 getBootstrap()，這段期間還沒有完整的 participantId。
  const accessCode = explicitAccessCode !== undefined ? explicitAccessCode : getStoredAccessCode();

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

  let res;
  try {
    res = await fetch(config.appsScriptUrl, {
      method: 'POST',
      // 用 text/plain 避免瀏覽器對 Apps Script 網址發出 CORS 預檢請求（PROJECT_SPEC §7）。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, accessCode, payload: payload || {} }),
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      fail('network_timeout', '連線逾時，請檢查網路連線後再試一次。');
    }
    fail('network_error', '無法連線到伺服器，請檢查網路連線後再試一次。');
  }
  if (timer) clearTimeout(timer);

  if (!res.ok) {
    fail('network_error', `伺服器連線異常（狀態碼 ${res.status}），請稍後再試一次。`);
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    fail('network_error', '伺服器回應格式不正確，請稍後再試一次。');
  }

  if (!json || json.ok !== true) {
    const code = json && json.code;
    const message = (json && json.message) || '發生未知錯誤，請再試一次。';
    if (code === 'ACCESS_DENIED' && action !== 'verifyAccess') {
      handleAccessDenied();
    }
    fail(code || 'unknown_error', message);
  }

  return json.data;
}

// ---------- API（與 docs/PROJECT_SPEC.md §7、api/local.js 相同介面） ----------

export async function getBootstrap() {
  return callAction('getBootstrap', {});
}

export async function verifyAccess(accessCode) {
  return callAction('verifyAccess', {}, accessCode);
}

export async function selectQuestion({ participantId, dayId, questionId }) {
  return callAction('selectQuestion', { participantId, dayId, questionId });
}

export async function cancelSelection({ participantId, selectionId }) {
  return callAction('cancelSelection', { participantId, selectionId });
}

export async function createSession({
  participantId,
  questionId,
  practicedAt,
  familiarity,
  weaknessCodes,
  stuckPoint,
  note,
  source,
  selectionId,
}) {
  return callAction('createSession', {
    participantId,
    questionId,
    practicedAt,
    familiarity,
    weaknessCodes,
    stuckPoint,
    note,
    source,
    selectionId,
  });
}

export async function voidSession({ participantId, sessionId }) {
  return callAction('voidSession', { participantId, sessionId });
}

export async function addParticipant({ displayName }) {
  return callAction('addParticipant', { displayName });
}

export async function updateMemberStatus({ participantId, status }) {
  return callAction('updateMemberStatus', { participantId, status });
}

export async function updateSettings(patch) {
  return callAction('updateSettings', patch || {});
}
