import { getBootstrap } from '../api/index.js';
import { el, announce, showError, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { weakList, unpracticedList, drawQuestion, todayInTaipei } from '../domain/progress.js';
import { massageExamLink, massageExamLinkText, acupointCoachLink } from '../integrations.js';

const LAST_DRAW_KEY = 'ylpm:lastDraw';

const noIdentityNotice = document.getElementById('no-identity-notice');
const drawContent = document.getElementById('draw-content');
const form = document.getElementById('draw-form');
const daySelect = document.getElementById('draw-day-select');
const resultSection = document.getElementById('result-section');
const resultContent = document.getElementById('result-content');

let bootstrap = null;
let identity = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

function getLastDrawId() {
  try {
    return sessionStorage.getItem(LAST_DRAW_KEY);
  } catch (e) {
    return null;
  }
}

function setLastDrawId(id) {
  try {
    sessionStorage.setItem(LAST_DRAW_KEY, id);
  } catch (e) {
    /* sessionStorage 不可用時忽略，僅影響「不重複抽到上一題」的體驗 */
  }
}

function populateDaySelect() {
  const sortedDays = bootstrap.days.slice().sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    daySelect.appendChild(el('option', { value: day.id }, [`${day.label} ${day.theme}`]));
  }
  daySelect.value = bootstrap.settings.currentDayId;
}

function poolForScope(scope, dayId) {
  const today = todayInTaipei();
  const options = { staleDays: bootstrap.settings.staleDays, today };
  if (scope === 'day') {
    const day = bootstrap.days.find((d) => d.id === dayId);
    if (!day) return [];
    return day.questionIds.map((id) => bootstrap.questions.find((q) => q.id === id)).filter(Boolean);
  }
  if (scope === 'weak') {
    return weakList(bootstrap.questions, bootstrap.sessions, identity.participantId, options).map((item) => item.question);
  }
  if (scope === 'unpracticed') {
    return unpracticedList(bootstrap.questions, bootstrap.sessions, identity.participantId);
  }
  return bootstrap.questions;
}

function emptyPoolMessage(scope) {
  if (scope === 'weak') return '你目前沒有弱題，請改選其他範圍。';
  if (scope === 'unpracticed') return '你已經把所有題目都練過了，請改選其他範圍。';
  if (scope === 'day') return '這個題組沒有題目，請改選其他範圍。';
  return '目前沒有題目可以抽，請改選其他範圍。';
}

function renderResult(q) {
  const day = bootstrap.days.find((d) => d.questionIds.includes(q.id));
  const examLink = massageExamLink(q, bootstrap.questionIntegrations);
  const acupointLink = acupointCoachLink();

  resultContent.textContent = '';
  resultContent.appendChild(el('h3', {}, [qLabel(q)]));
  if (day) resultContent.appendChild(el('p', {}, [`${day.label} ${day.theme}`]));
  resultContent.appendChild(
    el('div', { className: 'button-row' }, [
      el('a', { href: examLink.href, className: 'link-action' }, massageExamLinkText(examLink, q)),
      el('a', { href: `record.html?q=${encodeURIComponent(q.id)}&from=draw`, className: 'link-action' }, [
        `留下${qLabel(q)}練習紀錄`,
      ]),
      el('a', { href: `question.html?q=${encodeURIComponent(q.id)}`, className: 'link-action' }, [
        '查看紀錄',
        el('span', { className: 'vh' }, `：${qLabel(q)}`),
      ]),
      el('a', { href: acupointLink.href, className: 'link-action' }, ['前往經穴背誦教練']),
    ]),
  );
  document.getElementById('exam-note').hidden = examLink.isDeepLink;
  resultSection.hidden = false;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const scope = form.querySelector('input[name="scope"]:checked').value;
  const pool = poolForScope(scope, daySelect.value);

  if (pool.length === 0) {
    // S4 修正：說明文字放到結果區（區塊顯示，非 live region，只會被唸一次），
    // 200% 縮放或手機上也看得到，不是只寫在頁首的 #status。
    document.getElementById('exam-note').hidden = true;
    resultContent.textContent = '';
    resultContent.appendChild(el('p', {}, [emptyPoolMessage(scope)]));
    resultSection.hidden = false;
    // 焦點留在「抽題」按鈕（沒有移動焦點），#status 仍播報同一句原因。
    announce(emptyPoolMessage(scope));
    return;
  }

  const q = drawQuestion(pool, getLastDrawId());
  setLastDrawId(q.id);
  renderResult(q);
  announce(`抽到${qLabel(q)}。`);
});

async function init() {
  identity = getIdentity();
  if (!identity) {
    noIdentityNotice.hidden = false;
    hideLoading();
    return;
  }

  try {
    bootstrap = await getBootstrap();
  } catch (e) {
    hideLoading();
    showError('資料載入失敗，請重新整理頁面再試一次。');
    return;
  }

  renderWhoami(bootstrap.participants);
  hideLoading();
  drawContent.hidden = false;

  populateDaySelect();
}

init();
