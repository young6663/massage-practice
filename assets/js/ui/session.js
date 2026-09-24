// 目前身份（裝置層級），存在 localStorage，key: ylpm:identity。
const KEY = 'ylpm:identity';

export function getIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.participantId || !parsed.accessCode) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function setIdentity({ groupId, participantId, accessCode }) {
  localStorage.setItem(KEY, JSON.stringify({ groupId, participantId, accessCode }));
}

// 通行碼驗證成功、但還沒選擇「你是誰」之前先存通行碼（who.html 流程中間狀態）。
// appsScript 後端每個請求都要帶通行碼（PROJECT_SPEC §6），所以驗證成功後要立刻存起來，
// 這樣通行碼驗證成功後、選身份完成前這段時間的 getBootstrap() 才抓得到資料。
export function setVerifiedAccessCode(groupId, accessCode) {
  let participantId = null;
  try {
    const raw = localStorage.getItem(KEY);
    const existing = raw ? JSON.parse(raw) : null;
    if (existing && existing.participantId) participantId = existing.participantId;
  } catch (e) {
    participantId = null;
  }
  localStorage.setItem(KEY, JSON.stringify({ groupId, participantId, accessCode }));
}

export function clearIdentity() {
  localStorage.removeItem(KEY);
}

export function hasIdentity() {
  return getIdentity() !== null;
}

// 已驗證過的通行碼可能先於完整身份存在（例如切換身份時）；單獨讀取供 who.html 判斷是否要再問一次通行碼。
export function getStoredAccessCode() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.accessCode ? parsed.accessCode : null;
  } catch (e) {
    return null;
  }
}
