// local 後端：資料存在瀏覽器 localStorage，用 data/seed.json（＋可選的 private/seed.members.json）初始化。
// 錯誤慣例：所有函式失敗時 throw { ok: false, code, message }，message 為可直接顯示的繁體中文；成功一律回傳 resolve 的物件（不包 ok:true）。
// 輸入驗證規則對齊 docs/PROJECT_SPEC.md §6.1，讓 local 與 appsScript 兩個 adapter 行為一致（Phase 5 決議）。
import { config } from '../config.js';
import { WEAKNESS_CATEGORIES } from '../constants.js';
import { todayInTaipei } from '../domain/progress.js';

const STORAGE_KEY = 'ylpm:db:v1';
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 20;
const VALID_WEAKNESS_CODES = WEAKNESS_CATEGORIES.map((w) => w.code);

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function trimAndLimit(value, fieldLabel) {
  const text = (value || '').toString().trim();
  if (text.length > MAX_TEXT_LEN) fail('validation', `「${fieldLabel}」內容過長，請控制在 ${MAX_TEXT_LEN} 字以內。`);
  return text;
}

let dbCache = null;
let initPromise = null;

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function delay() {
  const ms = config.localLatencyMs || 0;
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(code, message) {
  const err = { ok: false, code, message };
  throw err;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dbCache));
  } catch (e) {
    fail('storage_full', '無法儲存資料，瀏覽器儲存空間可能已滿。');
  }
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) return null;
  return res.json();
}

async function buildInitialDb() {
  const seed = await fetchJson(new URL('../../../data/seed.json', import.meta.url));
  if (!seed) fail('seed_missing', '找不到初始題目資料，請確認 data/seed.json 存在。');

  let membersSeed = null;
  try {
    membersSeed = await fetchJson(new URL('../../../private/seed.members.json', import.meta.url));
  } catch (e) {
    membersSeed = null;
  }
  if (!membersSeed) {
    membersSeed = { participants: [], groupMembers: [], selections: [], practiceSessions: [] };
  }

  const group = seed.groups.find((g) => g.id === config.groupId) || seed.groups[0];

  return {
    schemaVersion: 1,
    accessCode: config.localAccessCode,
    group: { id: group.id, name: group.name, status: 'active' },
    settings: { [config.groupId]: { ...seed.settings[config.groupId] } },
    questions: seed.questions,
    practiceDays: seed.practiceDays,
    questionIntegrations: seed.questionIntegrations || [],
    participants: membersSeed.participants || [],
    groupMembers: membersSeed.groupMembers || [],
    selections: membersSeed.selections || [],
    practiceSessions: membersSeed.practiceSessions || [],
  };
}

async function getDb() {
  if (dbCache) return dbCache;
  if (!initPromise) {
    initPromise = (async () => {
      const stored = loadFromStorage();
      if (stored) {
        dbCache = stored;
      } else {
        dbCache = await buildInitialDb();
        saveToStorage();
      }
      return dbCache;
    })();
  }
  return initPromise;
}

function activeSelectionsForDay(db, dayId, round) {
  return db.selections.filter(
    (s) => s.dayId === dayId && s.round === round && s.groupId === config.groupId && !s.canceledAt,
  );
}

// ---------- API ----------

export async function getBootstrap() {
  await delay();
  const db = await getDb();
  return {
    group: db.group,
    settings: db.settings[config.groupId],
    participants: db.participants,
    members: db.groupMembers,
    questions: db.questions,
    days: db.practiceDays,
    questionIntegrations: db.questionIntegrations,
    selections: db.selections,
    sessions: db.practiceSessions,
  };
}

export async function verifyAccess(accessCode) {
  await delay();
  const db = await getDb();
  if (accessCode !== db.accessCode) {
    fail('invalid_access_code', '通行碼不正確，請再確認一次。');
  }
  return { group: db.group };
}

export async function selectQuestion({ participantId, dayId, questionId }) {
  await delay();
  const db = await getDb();
  const round = db.settings[config.groupId].currentRound;
  let selection = db.selections.find(
    (s) =>
      s.participantId === participantId &&
      s.dayId === dayId &&
      s.questionId === questionId &&
      s.round === round &&
      s.groupId === config.groupId &&
      !s.canceledAt,
  );
  if (!selection) {
    selection = {
      id: uuid(),
      groupId: config.groupId,
      round,
      dayId,
      participantId,
      questionId,
      createdAt: nowIso(),
      canceledAt: null,
    };
    db.selections.push(selection);
    saveToStorage();
  }
  return { selection, daySelections: activeSelectionsForDay(db, dayId, round) };
}

export async function cancelSelection({ participantId, selectionId }) {
  await delay();
  const db = await getDb();
  const sel = db.selections.find((s) => s.id === selectionId);
  if (!sel) fail('not_found', '找不到這筆選題。');
  if (sel.participantId !== participantId) fail('forbidden', '不能取消別人的選題。');
  if (!sel.canceledAt) {
    sel.canceledAt = nowIso();
    saveToStorage();
  }
  return { daySelections: activeSelectionsForDay(db, sel.dayId, sel.round) };
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
  await delay();
  const db = await getDb();
  if (!participantId || !questionId) fail('validation', '缺少參與者或題目資料。');
  if (![1, 2, 3, 4].includes(Number(familiarity))) fail('validation', '請選擇熟悉程度。');
  if (!practicedAt || !isValidDateString(practicedAt)) fail('validation', '請填寫正確格式的練習日期（YYYY-MM-DD）。');
  if (practicedAt > todayInTaipei()) fail('validation', '練習日期不能晚於今天。');
  const codes = Array.isArray(weaknessCodes) ? weaknessCodes : [];
  for (const code of codes) {
    if (!VALID_WEAKNESS_CODES.includes(code)) fail('validation', '弱點分類不正確。');
  }
  const cleanStuckPoint = trimAndLimit(stuckPoint, '卡在哪裡');
  const cleanNote = trimAndLimit(note, '備註');
  const allowedSources = ['selection', 'draw', 'direct'];
  const session = {
    id: uuid(),
    groupId: config.groupId,
    participantId,
    questionId,
    practicedAt,
    familiarity: Number(familiarity),
    weaknessCodes: codes,
    stuckPoint: cleanStuckPoint,
    note: cleanNote,
    source: allowedSources.includes(source) ? source : 'direct',
    selectionId: selectionId || null,
    createdAt: nowIso(),
    voidedAt: null,
  };
  db.practiceSessions.push(session);
  saveToStorage();
  return { session };
}

export async function voidSession({ participantId, sessionId }) {
  await delay();
  const db = await getDb();
  const session = db.practiceSessions.find((s) => s.id === sessionId);
  if (!session) fail('not_found', '找不到這筆練習紀錄。');
  if (session.participantId !== participantId) fail('forbidden', '不能作廢別人的紀錄。');
  if (!session.voidedAt) {
    session.voidedAt = nowIso();
    saveToStorage();
  }
  return { session };
}

export async function addParticipant({ displayName }) {
  await delay();
  const db = await getDb();
  const name = (displayName || '').trim();
  if (!name) fail('validation', '請輸入顯示名稱。');
  if (name.length > MAX_NAME_LEN) fail('validation', `顯示名稱最多 ${MAX_NAME_LEN} 個字。`);
  const participant = { id: uuid(), displayName: name, createdAt: nowIso() };
  const member = {
    groupId: config.groupId,
    participantId: participant.id,
    role: 'member',
    status: 'active',
    joinedAt: nowIso(),
  };
  db.participants.push(participant);
  db.groupMembers.push(member);
  saveToStorage();
  return { participant, member };
}

export async function updateMemberStatus({ participantId, status }) {
  await delay();
  const db = await getDb();
  if (!['active', 'paused', 'left'].includes(status)) fail('validation', '狀態不正確。');
  const member = db.groupMembers.find((m) => m.participantId === participantId && m.groupId === config.groupId);
  if (!member) fail('not_found', '找不到這位成員。');
  member.status = status;
  saveToStorage();
  return { member };
}

export async function updateSettings(patch) {
  await delay();
  const db = await getDb();
  const settings = db.settings[config.groupId];
  if (patch.currentDayId !== undefined) settings.currentDayId = patch.currentDayId;
  if (patch.selectionLimit !== undefined) settings.selectionLimit = patch.selectionLimit;
  if (patch.currentRound !== undefined) settings.currentRound = patch.currentRound;
  saveToStorage();
  return { settings: db.settings[config.groupId] };
}
