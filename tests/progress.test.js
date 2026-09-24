import { test, assert, assertEqual } from './harness.js';
import {
  todayInTaipei,
  formatDateDisplay,
  formatDateWithWeekday,
  daysBetween,
  questionStats,
  pendingSelections,
  weakList,
  unpracticedList,
  remainingForDay,
  nextStep,
  drawQuestion,
  questionsByStatus,
  dayForQuestion,
  filterAllQuestions,
  orderDaysForToday,
} from '../assets/js/domain/progress.js';

const Q = [
  { id: 'q01', number: 1, title: '頸椎退行性變化' },
  { id: 'q27', number: 27, title: '橈神經麻痺' },
  { id: 'q35', number: 35, title: '坐骨神經痛／腰椎間盤突出' },
];

function session(overrides) {
  return {
    id: 's-' + Math.random().toString(36).slice(2),
    groupId: 'g1',
    participantId: 'p01',
    questionId: 'q27',
    practicedAt: '2026-09-20',
    familiarity: 2,
    weaknessCodes: [],
    stuckPoint: '',
    note: '',
    source: 'direct',
    selectionId: null,
    createdAt: '2026-09-20T10:00:00+08:00',
    voidedAt: null,
    ...overrides,
  };
}

function selection(overrides) {
  return {
    id: 'sel-' + Math.random().toString(36).slice(2),
    groupId: 'g1',
    round: 1,
    dayId: 'd1',
    participantId: 'p01',
    questionId: 'q27',
    createdAt: '2026-09-20T09:00:00+08:00',
    canceledAt: null,
    ...overrides,
  };
}

// ---------- 日期工具 ----------

test('todayInTaipei：回傳 YYYY-MM-DD 格式', () => {
  const t = todayInTaipei(new Date('2026-09-23T20:00:00Z'));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(t), `格式不對：${t}`);
});

test('formatDateDisplay：今年不加年份', () => {
  assertEqual(formatDateDisplay('2026-09-23', '2026-01-01'), '9月23日');
});

test('formatDateDisplay：非今年加年份', () => {
  assertEqual(formatDateDisplay('2025-09-23', '2026-01-01'), '2025年9月23日');
});

test('daysBetween：計算天數差', () => {
  assertEqual(daysBetween('2026-09-01', '2026-09-15'), 14);
  assertEqual(daysBetween('2026-09-15', '2026-09-15'), 0);
});

// ---------- questionStats ----------

test('questionStats：無紀錄回傳 count 0', () => {
  const stats = questionStats([], 'p01', 'q27');
  assertEqual(stats.count, 0);
  assertEqual(stats.first, null);
});

test('questionStats：已作廢的紀錄不計入', () => {
  const sessions = [session({ id: 's1', voidedAt: '2026-09-21T00:00:00+08:00' })];
  const stats = questionStats(sessions, 'p01', 'q27');
  assertEqual(stats.count, 0);
});

test('questionStats：同一天依 createdAt 排序決定最新一筆', () => {
  const sessions = [
    session({ id: 's1', practicedAt: '2026-09-20', familiarity: 1, createdAt: '2026-09-20T08:00:00+08:00' }),
    session({ id: 's2', practicedAt: '2026-09-20', familiarity: 3, createdAt: '2026-09-20T18:00:00+08:00' }),
  ];
  const stats = questionStats(sessions, 'p01', 'q27');
  assertEqual(stats.count, 2);
  assertEqual(stats.latest.id, 's2');
  assertEqual(stats.first.id, 's1');
});

test('questionStats：很久沒練的邊界（剛好等於 staleDays 算很久沒練）', () => {
  const sessions = [session({ id: 's1', practicedAt: '2026-09-01', familiarity: 3 })];
  const stats14 = questionStats(sessions, 'p01', 'q27', { staleDays: 14, today: '2026-09-15' });
  assertEqual(stats14.isStale, true, '剛好 14 天應算很久沒練');
  const stats13 = questionStats(sessions, 'p01', 'q27', { staleDays: 14, today: '2026-09-14' });
  assertEqual(stats13.isStale, false, '13 天不算很久沒練');
});

// ---------- pendingSelections ----------

test('pendingSelections：選題後沒有練習紀錄 → 待練', () => {
  const selections = [selection({ id: 'sel1', createdAt: '2026-09-20T09:00:00+08:00' })];
  const result = pendingSelections(selections, [], 'p01', 1);
  assertEqual(result.length, 1);
  assertEqual(result[0].id, 'sel1');
});

test('pendingSelections：選題後已練習（createdAt >= 選題時間）→ 不算待練', () => {
  const selections = [selection({ id: 'sel1', createdAt: '2026-09-20T09:00:00+08:00' })];
  const sessions = [session({ createdAt: '2026-09-20T10:00:00+08:00' })];
  const result = pendingSelections(selections, sessions, 'p01', 1);
  assertEqual(result.length, 0);
});

test('pendingSelections：練習紀錄早於選題時間（換題重選）→ 仍算待練', () => {
  const selections = [selection({ id: 'sel1', createdAt: '2026-09-20T09:00:00+08:00' })];
  const sessions = [session({ createdAt: '2026-09-19T10:00:00+08:00' })];
  const result = pendingSelections(selections, sessions, 'p01', 1);
  assertEqual(result.length, 1);
});

test('pendingSelections：已取消的選題不算待練', () => {
  const selections = [selection({ id: 'sel1', canceledAt: '2026-09-20T09:30:00+08:00' })];
  const result = pendingSelections(selections, [], 'p01', 1);
  assertEqual(result.length, 0);
});

test('pendingSelections：不同輪次不算', () => {
  const selections = [selection({ id: 'sel1', round: 1 })];
  const result = pendingSelections(selections, [], 'p01', 2);
  assertEqual(result.length, 0);
});

// ---------- weakList / unpracticedList ----------

test('weakList：很不熟排最前，還要再練其次', () => {
  const sessions = [
    session({ id: 's1', questionId: 'q01', familiarity: 2, practicedAt: '2026-09-20' }),
    session({ id: 's2', questionId: 'q27', familiarity: 1, practicedAt: '2026-09-20' }),
  ];
  const list = weakList(Q, sessions, 'p01', { today: '2026-09-21' });
  assertEqual(list.length, 2);
  assertEqual(list[0].question.id, 'q27');
  assertEqual(list[1].question.id, 'q01');
});

test('weakList：很久沒練（大致可以但超過天數）歸類第三層', () => {
  const sessions = [session({ id: 's1', questionId: 'q35', familiarity: 3, practicedAt: '2026-08-01' })];
  const list = weakList(Q, sessions, 'p01', { staleDays: 14, today: '2026-09-21' });
  assertEqual(list.length, 1);
  assertEqual(list[0].tier, 3);
  assert(list[0].reason.includes('很久沒練'), '原因文字應說明很久沒練');
});

test('weakList：可以上場且未超過天數 → 不列入弱題', () => {
  const sessions = [session({ id: 's1', questionId: 'q35', familiarity: 4, practicedAt: '2026-09-20' })];
  const list = weakList(Q, sessions, 'p01', { staleDays: 14, today: '2026-09-21' });
  assertEqual(list.length, 0);
});

test('weakList：作廢的紀錄不影響弱題判斷', () => {
  const sessions = [session({ id: 's1', questionId: 'q27', familiarity: 1, voidedAt: '2026-09-21T00:00:00+08:00' })];
  const list = weakList(Q, sessions, 'p01', { today: '2026-09-21' });
  assertEqual(list.length, 0);
});

test('unpracticedList：沒有任何有效紀錄的題目才列入', () => {
  const sessions = [session({ id: 's1', questionId: 'q27' })];
  const list = unpracticedList(Q, sessions, 'p01');
  assertEqual(list.map((q) => q.id), ['q01', 'q35']);
});

test('unpracticedList：全部作廢仍算尚未練過', () => {
  const sessions = [session({ id: 's1', questionId: 'q27', voidedAt: '2026-09-21T00:00:00+08:00' })];
  const list = unpracticedList(Q, sessions, 'p01');
  assertEqual(list.map((q) => q.id), ['q01', 'q27', 'q35']);
});

// ---------- questionsByStatus ----------

test('questionsByStatus：all 回傳全部題目並依題號排序', () => {
  const list = questionsByStatus(Q, [], 'p01', 'all');
  assertEqual(list.map((item) => item.question.id), ['q01', 'q27', 'q35']);
});

test('questionsByStatus：unpracticed 只回傳沒有有效紀錄的題目', () => {
  const sessions = [session({ id: 's1', questionId: 'q27' })];
  const list = questionsByStatus(Q, sessions, 'p01', 'unpracticed');
  assertEqual(list.map((item) => item.question.id), ['q01', 'q35']);
});

test('questionsByStatus：依熟悉程度代碼篩選（依最近一次）', () => {
  const sessions = [
    session({ id: 's1', questionId: 'q27', familiarity: 1, practicedAt: '2026-09-19' }),
    session({ id: 's2', questionId: 'q27', familiarity: 3, practicedAt: '2026-09-20' }),
    session({ id: 's3', questionId: 'q35', familiarity: 3, practicedAt: '2026-09-20' }),
  ];
  const list = questionsByStatus(Q, sessions, 'p01', 3, { today: '2026-09-21' });
  assertEqual(list.map((item) => item.question.id), ['q27', 'q35']);
});

// ---------- dayForQuestion / filterAllQuestions ----------

const DAYS = [
  { id: 'd1', order: 1, label: '第一天', theme: '神經類', questionIds: ['q27', 'q35'] },
  { id: 'd2', order: 2, label: '第二天', theme: '頸肩與上肢', questionIds: ['q01'] },
];

test('dayForQuestion：找到題目所屬題組', () => {
  assertEqual(dayForQuestion(DAYS, 'q27').id, 'd1');
  assertEqual(dayForQuestion(DAYS, 'q01').id, 'd2');
});

test('dayForQuestion：找不到時回傳 null', () => {
  assertEqual(dayForQuestion(DAYS, 'q99'), null);
});

test('filterAllQuestions：不帶篩選條件回傳全部並依題號排序', () => {
  const list = filterAllQuestions(Q, DAYS, [], 'p01');
  assertEqual(list.map((item) => item.question.id), ['q01', 'q27', 'q35']);
});

test('filterAllQuestions：依第幾天篩選', () => {
  const list = filterAllQuestions(Q, DAYS, [], 'p01', { dayId: 'd1' });
  assertEqual(list.map((item) => item.question.id), ['q27', 'q35']);
});

test('filterAllQuestions：依題號篩選', () => {
  const list = filterAllQuestions(Q, DAYS, [], 'p01', { number: 27 });
  assertEqual(list.map((item) => item.question.id), ['q27']);
});

test('filterAllQuestions：依狀態篩選（尚未練過）', () => {
  const sessions = [session({ id: 's1', questionId: 'q27' })];
  const list = filterAllQuestions(Q, DAYS, sessions, 'p01', { status: 'unpracticed' });
  assertEqual(list.map((item) => item.question.id), ['q01', 'q35']);
});

test('filterAllQuestions：多個條件同時套用', () => {
  const sessions = [session({ id: 's1', questionId: 'q35', familiarity: 2 })];
  const list = filterAllQuestions(Q, DAYS, sessions, 'p01', { dayId: 'd1', status: 2 });
  assertEqual(list.map((item) => item.question.id), ['q35']);
});

// ---------- remainingForDay ----------

test('remainingForDay：一般情況計算還差幾題', () => {
  const selections = [selection({ id: 's1' })];
  const result = remainingForDay(selections, 'p01', 'd1', 1, 2);
  assertEqual(result.remaining, 1);
  assertEqual(result.metOrExceeded, false);
});

test('remainingForDay：達到上限時 remaining 為 0 且 metOrExceeded 為 true', () => {
  const selections = [selection({ id: 's1', questionId: 'q27' }), selection({ id: 's2', questionId: 'q35' })];
  const result = remainingForDay(selections, 'p01', 'd1', 1, 2);
  assertEqual(result.remaining, 0);
  assertEqual(result.metOrExceeded, true);
});

test('remainingForDay：超過上限不會變負數', () => {
  const selections = [
    selection({ id: 's1', questionId: 'q01' }),
    selection({ id: 's2', questionId: 'q27' }),
    selection({ id: 's3', questionId: 'q35' }),
  ];
  const result = remainingForDay(selections, 'p01', 'd1', 1, 2);
  assertEqual(result.remaining, 0);
});

test('remainingForDay：unlimited 只回報已選題數', () => {
  const selections = [selection({ id: 's1' })];
  const result = remainingForDay(selections, 'p01', 'd1', 1, 'unlimited');
  assertEqual(result.limit, 'unlimited');
  assertEqual(result.selectedCount, 1);
  assertEqual(result.remaining, null);
});

test('remainingForDay：已取消的選題不計入', () => {
  const selections = [selection({ id: 's1', canceledAt: '2026-09-20T10:00:00+08:00' })];
  const result = remainingForDay(selections, 'p01', 'd1', 1, 2);
  assertEqual(result.selectedCount, 0);
});

// ---------- nextStep ----------

test('nextStep：未選身份優先', () => {
  const step = nextStep({ hasIdentity: false });
  assertEqual(step.type, 'chooseIdentity');
});

test('nextStep：今天題組還差題數', () => {
  const step = nextStep({
    hasIdentity: true,
    remaining: { limit: 2, remaining: 1, selectedCount: 1 },
    currentDay: { id: 'd1', label: '第一天' },
    pending: [],
    weak: [],
    questions: Q,
  });
  assertEqual(step.type, 'selectMore');
  assert(step.message.includes('還差 1 題'));
});

test('nextStep：有待練題', () => {
  const step = nextStep({
    hasIdentity: true,
    remaining: { limit: 2, remaining: 0, selectedCount: 2 },
    currentDay: { id: 'd1', label: '第一天' },
    pending: [{ questionId: 'q27' }],
    weak: [],
    questions: Q,
  });
  assertEqual(step.type, 'practice');
  assert(step.message.includes('27'));
});

test('nextStep：有弱題但無待練題', () => {
  const step = nextStep({
    hasIdentity: true,
    remaining: { limit: 2, remaining: 0, selectedCount: 2 },
    currentDay: { id: 'd1', label: '第一天' },
    pending: [],
    weak: [{ question: { id: 'q35', number: 35, title: '坐骨神經痛／腰椎間盤突出' } }],
    questions: Q,
  });
  assertEqual(step.type, 'reviewWeak');
});

test('nextStep：都沒有 → 建議模擬抽題', () => {
  const step = nextStep({
    hasIdentity: true,
    remaining: { limit: 2, remaining: 0, selectedCount: 2 },
    currentDay: { id: 'd1', label: '第一天' },
    pending: [],
    weak: [],
    questions: Q,
  });
  assertEqual(step.type, 'draw');
});

// ---------- drawQuestion ----------

test('drawQuestion：題庫為空回傳 null', () => {
  assertEqual(drawQuestion([], 'q27'), null);
});

test('drawQuestion：題庫只有 1 題直接回傳', () => {
  const result = drawQuestion([Q[0]], 'q01');
  assertEqual(result.id, 'q01');
});

test('drawQuestion：題庫大於 1 題時不會抽到上一題', () => {
  const rng = () => 0; // 固定回傳第一個候選
  for (let i = 0; i < 10; i += 1) {
    const result = drawQuestion(Q, 'q27', rng);
    assert(result.id !== 'q27', '不應抽到上一題');
  }
});

test('drawQuestion：lastId 不在題庫中時仍可正常抽題', () => {
  const result = drawQuestion(Q, 'q99', () => 0.99);
  assert(Q.some((q) => q.id === result.id));
});

// ---------- formatDateWithWeekday ----------

test('formatDateWithWeekday：格式為「M月D日 星期X」', () => {
  assertEqual(formatDateWithWeekday('2026-10-09'), '10月9日 星期五');
  assertEqual(formatDateWithWeekday('2026-10-11'), '10月11日 星期日');
});

test('formatDateWithWeekday：空字串回傳空字串', () => {
  assertEqual(formatDateWithWeekday(''), '');
  assertEqual(formatDateWithWeekday(null), '');
});

// ---------- orderDaysForToday（首頁五天選題總覽排序） ----------

const DAYS_WITH_DATE = [
  { id: 'd1', order: 1, label: '第一天', theme: '神經類', date: '2026-10-09', questionIds: [] },
  { id: 'd2', order: 2, label: '第二天', theme: '頸肩與上肢', date: '2026-10-11', questionIds: [] },
  { id: 'd3', order: 3, label: '第三天', theme: '腰臀、髖', date: '2026-10-18', questionIds: [] },
  { id: 'd4', order: 4, label: '第四天', theme: '特殊題', date: '2026-11-01', questionIds: [] },
  { id: 'd5', order: 5, label: '第五天', theme: '補充題', date: '2026-11-08', questionIds: [] },
];

test('orderDaysForToday：今天剛好是練習日 → 該天最前，kind 為 today', () => {
  const result = orderDaysForToday(DAYS_WITH_DATE, '2026-10-09');
  assertEqual(result.featured, { id: 'd1', kind: 'today' });
  assertEqual(result.days.map((d) => d.id), ['d1', 'd2', 'd3', 'd4', 'd5']);
});

test('orderDaysForToday：介於兩個練習日之間 → 下一次練習日最前，kind 為 next', () => {
  const result = orderDaysForToday(DAYS_WITH_DATE, '2026-10-15');
  assertEqual(result.featured, { id: 'd3', kind: 'next' });
  assertEqual(result.days.map((d) => d.id), ['d3', 'd1', 'd2', 'd4', 'd5']);
});

test('orderDaysForToday：在第一個練習日之前 → 第一天最前，kind 為 next', () => {
  const result = orderDaysForToday(DAYS_WITH_DATE, '2026-09-24');
  assertEqual(result.featured, { id: 'd1', kind: 'next' });
  assertEqual(result.days.map((d) => d.id), ['d1', 'd2', 'd3', 'd4', 'd5']);
});

test('orderDaysForToday：所有練習日都已過去 → 不標記，維持固定順序', () => {
  const result = orderDaysForToday(DAYS_WITH_DATE, '2026-11-09');
  assertEqual(result.featured, null);
  assertEqual(result.days.map((d) => d.id), ['d1', 'd2', 'd3', 'd4', 'd5']);
});

test('orderDaysForToday：缺日期的天永遠不會被標記，且維持固定順序中的位置', () => {
  const days = [
    { id: 'd1', order: 1, label: '第一天', theme: '神經類', date: '2026-10-09', questionIds: [] },
    { id: 'd2', order: 2, label: '第二天', theme: '頸肩與上肢', date: '', questionIds: [] },
    { id: 'd3', order: 3, label: '第三天', theme: '腰臀、髖', date: '2026-10-18', questionIds: [] },
  ];
  // 今天介於 d1、d3 之間，d2 沒有日期，不該被選為 next，應該跳到 d3。
  const between = orderDaysForToday(days, '2026-10-10');
  assertEqual(between.featured, { id: 'd3', kind: 'next' });
  assertEqual(between.days.map((d) => d.id), ['d3', 'd1', 'd2']);

  // 沒有任何一天日期等於今天或在今天之後時，缺日期的天也不會被標記，維持固定順序。
  const after = orderDaysForToday(days, '2026-11-01');
  assertEqual(after.featured, null);
  assertEqual(after.days.map((d) => d.id), ['d1', 'd2', 'd3']);
});

test('orderDaysForToday：全部天數都沒有日期 → 不標記，維持固定順序', () => {
  const days = [
    { id: 'd1', order: 1, label: '第一天', theme: '神經類', questionIds: [] },
    { id: 'd2', order: 2, label: '第二天', theme: '頸肩與上肢', questionIds: [] },
  ];
  const result = orderDaysForToday(days, '2026-10-09');
  assertEqual(result.featured, null);
  assertEqual(result.days.map((d) => d.id), ['d1', 'd2']);
});
