import { getBootstrap, voidSession } from '../api/index.js';
import { el, announce, showError, setBusy, clearBusy, isBusy, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { formatDateDisplay, todayInTaipei } from '../domain/progress.js';
import { familiarityLabel, familiarityCssClass, weaknessLabel } from '../constants.js';
import { massageExamLink, acupointCoachLink, massageExamLinkText } from '../integrations.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const questionContent = document.getElementById('question-content');
const savedNotice = document.getElementById('saved-notice');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

const params = new URLSearchParams(window.location.search);
const questionId = params.get('q');
const savedSessionId = params.get('saved');

let bootstrap = null;
let identity = null;
let question = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

function sortByPracticedThenCreated(a, b) {
  if (a.practicedAt !== b.practicedAt) return a.practicedAt < b.practicedAt ? -1 : 1;
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

function myAllSessions() {
  return bootstrap.sessions
    .filter((s) => s.participantId === identity.participantId && s.questionId === questionId)
    .slice()
    .sort(sortByPracticedThenCreated);
}

function myActiveSessions() {
  return myAllSessions().filter((s) => !s.voidedAt);
}

function commonWeaknesses(activeSessions) {
  const counts = new Map();
  for (const s of activeSessions) {
    for (const code of s.weaknessCodes || []) {
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  }
  if (counts.size === 0) return '無';
  const max = Math.max(...counts.values());
  const topCodes = Array.from(counts.entries())
    .filter(([, count]) => count === max)
    .map(([code]) => code);
  return topCodes.map(weaknessLabel).join('、');
}

function renderSummary(activeSessions) {
  const list = document.getElementById('summary-list');
  list.textContent = '';
  const count = activeSessions.length;
  const today = todayInTaipei();

  function addRow(term, desc) {
    list.appendChild(el('dt', {}, [term]));
    list.appendChild(el('dd', {}, [desc]));
  }

  addRow('練習次數', `${count} 次`);
  if (count === 0) {
    addRow('第一次狀態', '尚未練過');
    addRow('最近一次狀態', '尚未練過');
    addRow('最近練習日期', '尚未練過');
    addRow('常見弱點', '無');
    return;
  }
  const first = activeSessions[0];
  const latest = activeSessions[activeSessions.length - 1];
  addRow('第一次狀態', familiarityLabel(first.familiarity));
  addRow('最近一次狀態', familiarityLabel(latest.familiarity));
  addRow('最近練習日期', formatDateDisplay(latest.practicedAt, today));
  addRow('常見弱點', commonWeaknesses(activeSessions));
}

function renderActionLinks() {
  const container = document.getElementById('action-links');
  container.textContent = '';
  const label = qLabel(question);
  const examLink = massageExamLink(question, bootstrap.questionIntegrations);
  const acupointLink = acupointCoachLink();
  const day = bootstrap.days.find((d) => d.questionIds.includes(question.id));

  document.getElementById('exam-note').hidden = examLink.isDeepLink;

  container.appendChild(
    el('a', { href: `record.html?q=${encodeURIComponent(question.id)}&from=direct`, className: 'link-action' }, [
      '新增練習紀錄',
      el('span', { className: 'vh' }, `：${label}`),
    ]),
  );
  container.appendChild(
    el('a', { href: examLink.href, className: 'link-action' }, massageExamLinkText(examLink, question)),
  );
  container.appendChild(
    el('a', { href: acupointLink.href, className: 'link-action' }, ['前往經穴背誦教練']),
  );
  if (day) {
    container.appendChild(
      el('a', { href: `day.html?d=${encodeURIComponent(day.id)}`, className: 'link-action' }, [
        `回到${day.label}選題`,
      ]),
    );
  }
}

function buildHistoryItem(session, index) {
  const today = todayInTaipei();
  const dateText = formatDateDisplay(session.practicedAt, today);
  const famText = familiarityLabel(session.familiarity);
  const isVoided = !!session.voidedAt;

  const children = [];
  if (isVoided) {
    children.push(el('p', {}, [el('span', { className: 'void-tag' }, ['已作廢']), `｜${dateText}｜${famText}`]));
  } else {
    children.push(
      el('p', {}, [el('span', { className: 'entry-index' }, [`第 ${index + 1} 次`]), `｜${dateText}｜${famText}`]),
    );
  }

  if (session.weaknessCodes && session.weaknessCodes.length > 0) {
    children.push(el('p', {}, [`弱點：${session.weaknessCodes.map(weaknessLabel).join('、')}`]));
  }
  if (session.stuckPoint) {
    children.push(el('p', {}, [`卡在哪裡：${session.stuckPoint}`]));
  }
  if (session.note) {
    children.push(el('p', {}, [`備註：${session.note}`]));
  }

  if (!isVoided) {
    const button = el('button', { type: 'button', className: 'danger void-button' }, [
      '作廢這筆紀錄',
      el('span', { className: 'vh' }, `：第 ${index + 1} 次，${dateText}`),
    ]);
    button.addEventListener('click', () => onVoid(session.id, button));
    children.push(el('div', { className: 'button-row' }, [button]));
  }

  const li = el('li', { id: `session-${session.id}` }, children);
  if (isVoided) li.classList.add('voided');
  return li;
}

function renderHistory() {
  const all = myAllSessions();
  historyList.textContent = '';
  if (all.length === 0) {
    historyEmpty.hidden = false;
    return;
  }
  historyEmpty.hidden = true;
  let validIndex = 0;
  for (const session of all) {
    if (!session.voidedAt) validIndex += 1;
    const li = buildHistoryItem(session, session.voidedAt ? -1 : validIndex - 1);
    historyList.appendChild(li);
  }
}

async function onVoid(sessionId, button) {
  if (isBusy(button)) return;
  const confirmed = window.confirm('確定要作廢這筆練習紀錄嗎？作廢後不會被計入練習次數，但仍會保留在歷史中。');
  if (!confirmed) return;
  setBusy(button);
  try {
    await voidSession({ participantId: identity.participantId, sessionId });
    const sessionObj = bootstrap.sessions.find((s) => s.id === sessionId);
    if (sessionObj) sessionObj.voidedAt = new Date().toISOString();
    renderSummary(myActiveSessions());
    renderHistory();
    // A6 修正：作廢後畫面上的確認文字仍會寫著被作廢那筆的內容，與現況不符，直接收起來。
    savedNotice.hidden = true;
    // 作廢後這筆紀錄的按鈕會整個消失，焦點移到「練習歷史」標題（ACCESSIBILITY §4：元素被移除時移到相鄰標題）。
    const heading = document.getElementById('history-heading');
    heading.focus();
    announce('已作廢這筆練習紀錄。');
  } catch (err) {
    clearBusy(button);
    showError((err && err.message) || '作廢失敗，請再試一次。');
  }
}

async function init() {
  identity = getIdentity();
  if (!identity) {
    noIdentityNotice.hidden = false;
    hideLoading();
    return;
  }
  if (!questionId) {
    hideLoading();
    showError('缺少題目參數，請從題目頁面重新進入。');
    return;
  }

  try {
    bootstrap = await getBootstrap();
  } catch (e) {
    hideLoading();
    showError('資料載入失敗，請重新整理頁面再試一次。');
    return;
  }

  question = bootstrap.questions.find((q) => q.id === questionId);
  if (!question) {
    hideLoading();
    showError('找不到這一題。');
    return;
  }

  renderWhoami(bootstrap.participants);

  const label = qLabel(question);
  document.getElementById('page-heading').textContent = label;
  document.getElementById('page-title-tag').textContent = `單題紀錄：${label}｜乙級上岸練習`;

  hideLoading();
  questionContent.hidden = false;
  const activeSessions = myActiveSessions();
  renderSummary(activeSessions);
  renderActionLinks();
  renderHistory();

  if (savedSessionId) {
    const saved = bootstrap.sessions.find((s) => s.id === savedSessionId);
    if (saved) {
      const order = myActiveSessions().findIndex((s) => s.id === savedSessionId) + 1;
      savedNotice.textContent = `已儲存${label}練習紀錄：第 ${order} 次，${familiarityLabel(saved.familiarity)}。`;
      savedNotice.hidden = false;
      savedNotice.focus();
      // A6 修正：網址不再留著 &saved=…，重新整理或從術科網站按上一頁回來時不會又唸一次「已儲存…」。
      const url = new URL(window.location.href);
      url.searchParams.delete('saved');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }
}

init();
