// 衍生規則：全部是純函式，對應 docs/PROJECT_SPEC.md §4。
// 需要「今天」的函式都把日期當參數傳入（today），方便測試用固定日期，不依賴系統時鐘。
import { familiarityLabel } from '../constants.js';

// ---------- 日期工具 ----------

// 回傳 Asia/Taipei 時區的今天，格式 YYYY-MM-DD。
export function todayInTaipei(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

// "9月23日"；非今年才加年份，例如 "2025年9月23日"。
export function formatDateDisplay(dateStr, todayStr = todayInTaipei()) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const todayYear = Number(todayStr.split('-')[0]);
  const monthDay = `${m}月${d}日`;
  return y === todayYear ? monthDay : `${y}年${monthDay}`;
}

// 兩個 YYYY-MM-DD 之間相差幾天（later - earlier）。
export function daysBetween(earlierStr, laterStr) {
  const a = new Date(`${earlierStr}T00:00:00Z`);
  const b = new Date(`${laterStr}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// ---------- 排序輔助 ----------

function sortByPracticedThenCreated(a, b) {
  if (a.practicedAt !== b.practicedAt) return a.practicedAt < b.practicedAt ? -1 : 1;
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

function activeSessionsFor(sessions, participantId, questionId) {
  return sessions
    .filter((s) => s.participantId === participantId && s.questionId === questionId && !s.voidedAt)
    .slice()
    .sort(sortByPracticedThenCreated);
}

// ---------- §4.1 單題狀態 ----------

export function questionStats(sessions, participantId, questionId, options = {}) {
  const { staleDays = 14, today = todayInTaipei() } = options;
  const mine = activeSessionsFor(sessions, participantId, questionId);
  const count = mine.length;
  if (count === 0) {
    return { count: 0, first: null, latest: null, latestDate: null, isStale: false };
  }
  const first = mine[0];
  const latest = mine[mine.length - 1];
  const latestDate = latest.practicedAt;
  const isStale = daysBetween(latestDate, today) >= staleDays;
  return { count, first, latest, latestDate, isStale };
}

// ---------- §4.2 我的待練題 ----------
// 目前輪次的有效選題中，選題之後（session.createdAt >= selection.createdAt）還沒有任何練習紀錄的題目。

export function pendingSelections(selections, sessions, participantId, round) {
  const mine = selections.filter(
    (s) => s.participantId === participantId && s.round === round && !s.canceledAt,
  );
  return mine.filter((sel) => {
    const practicedAfter = sessions.some(
      (ses) =>
        ses.participantId === participantId &&
        ses.questionId === sel.questionId &&
        !ses.voidedAt &&
        ses.createdAt >= sel.createdAt,
    );
    return !practicedAfter;
  });
}

// ---------- §4.3 我的弱題 ----------
// tier 1：最近一次很不熟；tier 2：最近一次還要再練；tier 3：很久沒練（最近一次大致可以／可以上場但已超過 staleDays）
// 同層依最後練習日期越久越前面，再依題號。「尚未練過」不列入，另外用 unpracticedList。

export function weakList(questions, sessions, participantId, options = {}) {
  const { staleDays = 14, today = todayInTaipei() } = options;
  const items = [];
  for (const q of questions) {
    const stats = questionStats(sessions, participantId, q.id, { staleDays, today });
    if (stats.count === 0) continue;
    const fam = stats.latest.familiarity;
    let tier = null;
    if (fam === 1) tier = 1;
    else if (fam === 2) tier = 2;
    else if (stats.isStale) tier = 3;
    if (tier === null) continue;
    items.push({
      question: q,
      tier,
      latestDate: stats.latestDate,
      count: stats.count,
      reason: buildWeakReason(fam, stats, tier, today),
    });
  }
  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.latestDate !== b.latestDate) return a.latestDate < b.latestDate ? -1 : 1;
    return a.question.number - b.question.number;
  });
  return items;
}

function buildWeakReason(fam, stats, tier, today) {
  const dateDisplay = formatDateDisplay(stats.latestDate, today);
  const famText = familiarityLabel(fam);
  if (tier === 3) {
    return `最近一次：${famText}（${dateDisplay}），已經很久沒練，共練 ${stats.count} 次`;
  }
  return `最近一次：${famText}（${dateDisplay}），共練 ${stats.count} 次`;
}

// 尚未練過的題目，單獨一區，依題號排序。
export function unpracticedList(questions, sessions, participantId) {
  return questions
    .filter((q) => !sessions.some((s) => s.participantId === participantId && s.questionId === q.id && !s.voidedAt))
    .slice()
    .sort((a, b) => a.number - b.number);
}

// ---------- §4.4 還差幾題 ----------
// selectionLimit 可能是數字或 'unlimited'。上限只是建議，不阻擋。

export function remainingForDay(selections, participantId, dayId, round, selectionLimit) {
  const selectedCount = selections.filter(
    (s) => s.participantId === participantId && s.dayId === dayId && s.round === round && !s.canceledAt,
  ).length;
  if (selectionLimit === 'unlimited') {
    return { limit: 'unlimited', selectedCount, remaining: null, metOrExceeded: false };
  }
  const remaining = Math.max(0, selectionLimit - selectedCount);
  return { limit: selectionLimit, selectedCount, remaining, metOrExceeded: selectedCount >= selectionLimit };
}

// ---------- §4.5 首頁「下一步」 ----------
// 依序取第一個成立者。

export function nextStep({ hasIdentity, remaining, currentDay, pending, weak, questions }) {
  if (!hasIdentity) {
    return { type: 'chooseIdentity', message: '先選擇你是誰' };
  }
  if (remaining && remaining.limit !== 'unlimited' && remaining.remaining > 0 && currentDay) {
    return {
      type: 'selectMore',
      message: `到${currentDay.label}選題，還差 ${remaining.remaining} 題`,
      dayId: currentDay.id,
    };
  }
  if (pending && pending.length > 0) {
    const sel = pending[0];
    const q = questions.find((item) => item.id === sel.questionId);
    return {
      type: 'practice',
      message: q ? `練習第${q.number}題${q.title}，練完留下紀錄` : '練習你選的題目，練完留下紀錄',
      questionId: sel.questionId,
    };
  }
  if (weak && weak.length > 0) {
    const q = weak[0].question;
    return { type: 'reviewWeak', message: `複習弱題：第${q.number}題${q.title}`, questionId: q.id };
  }
  return { type: 'draw', message: '試試模擬抽題' };
}

// ---------- 依狀態查看（weak.html「依狀態查看」、all.html 篩選共用） ----------
// status：'all' | 'unpracticed' | 1｜2｜3｜4（熟悉程度代碼，依最近一次）

function matchesStatus(stats, status) {
  if (status === 'all') return true;
  if (status === 'unpracticed') return stats.count === 0;
  return stats.count > 0 && stats.latest.familiarity === status;
}

export function questionsByStatus(questions, sessions, participantId, status, options = {}) {
  const { staleDays = 14, today = todayInTaipei() } = options;
  return questions
    .map((q) => ({ question: q, stats: questionStats(sessions, participantId, q.id, { staleDays, today }) }))
    .filter(({ stats }) => matchesStatus(stats, status))
    .sort((a, b) => a.question.number - b.question.number);
}

// ---------- 40 題總表篩選（all.html） ----------

export function dayForQuestion(days, questionId) {
  return days.find((d) => d.questionIds.includes(questionId)) || null;
}

// filters: { status: 'all'|'unpracticed'|1..4, dayId: 'all'|題組id, number: 題號或 null }
export function filterAllQuestions(questions, days, sessions, participantId, filters = {}, options = {}) {
  const { status = 'all', dayId = 'all', number = null } = filters;
  const { staleDays = 14, today = todayInTaipei() } = options;
  return questions
    .filter((q) => dayId === 'all' || (dayForQuestion(days, q.id) || {}).id === dayId)
    .filter((q) => !number || q.number === Number(number))
    .map((q) => ({
      question: q,
      day: dayForQuestion(days, q.id),
      stats: questionStats(sessions, participantId, q.id, { staleDays, today }),
    }))
    .filter(({ stats }) => matchesStatus(stats, status))
    .sort((a, b) => a.question.number - b.question.number);
}

// ---------- §4.6 模擬抽題 ----------
// 題庫超過 1 題時不會抽到上一題；題庫為空回傳 null。

export function drawQuestion(pool, lastId, rng = Math.random) {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  let candidates = pool.filter((q) => q.id !== lastId);
  if (candidates.length === 0) candidates = pool;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}
