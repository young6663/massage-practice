// 首頁＝五天進度工作台：五天切換器（原生按鈕＋hidden 切換區塊，不用 ARIA tablist），
// 切到哪天只顯示那天整組題目；每題可直接選題、看練習狀態、連去術科練習與新增紀錄。
import { getBootstrap } from '../api/index.js';
import { el, showError, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { acupointCoachLink, massageExamLink, massageExamLinkText } from '../integrations.js';
import { remainingForDay, todayInTaipei, orderDaysForToday, formatDateWithWeekday, questionStats } from '../domain/progress.js';
import { familiarityLabel } from '../constants.js';
import { qLabel, findMySelection, peerNamesFor, renderToggleButton, handleToggle } from '../ui/questionSelection.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const homeContent = document.getElementById('home-content');
const daySwitcher = document.getElementById('day-switcher');
const daysOverview = document.getElementById('days-overview');

let bootstrap = null;
let identity = null;

// 固定 1→5 順序（按鈕與區塊都用這個順序，不受「今天優先」影響）。
let orderedDays = [];
// 今天／下一次練習的標記，僅用來決定 h2 前綴與初始顯示哪一天，不影響順序。
let featured = null;
let currentDayId = null;
const dayButtonEls = new Map();

function dayCountSentence(remaining) {
  if (remaining.limit === 'unlimited') return `不限選題數，你已選 ${remaining.selectedCount} 題。`;
  return `你已選 ${remaining.selectedCount} 題（建議 ${remaining.limit} 題）。`;
}

function currentRemainingFor(day) {
  return remainingForDay(
    bootstrap.selections,
    identity.participantId,
    day.id,
    bootstrap.settings.currentRound,
    bootstrap.settings.selectionLimit,
  );
}

function renderMyStatus(li, day, q) {
  const mySel = findMySelection(bootstrap.selections, identity.participantId, day.id, q.id, bootstrap.settings.currentRound);
  li.querySelector('.my-status').textContent = mySel ? '你已選擇' : '你未選擇';
  li.classList.toggle('selected', !!mySel);
  return mySel;
}

function renderPeerStatus(li, day, q) {
  const names = peerNamesFor(bootstrap.selections, bootstrap.participants, day.id, q.id, bootstrap.settings.currentRound);
  li.querySelector('.peer-status').textContent = names.length > 0 ? `${names.length} 人選擇：${names.join('、')}` : '還沒有人選';
}

// 已練次數／最近熟悉度小提示，重用 domain/progress.js 的 questionStats（不重複造輪子）。
function practiceTipText(q) {
  const stats = questionStats(bootstrap.sessions, identity.participantId, q.id);
  if (stats.count === 0) return '尚未練過';
  return `已練 ${stats.count} 次，最近：${familiarityLabel(stats.latest.familiarity)}`;
}

function refreshQuestionLi(li, day, q) {
  const mySel = renderMyStatus(li, day, q);
  renderPeerStatus(li, day, q);
  renderToggleButton(li.querySelector('.toggle-select'), mySel);
}

function refreshDayCount(day) {
  document.getElementById(`day-count-${day.id}`).textContent = dayCountSentence(currentRemainingFor(day));
}

function renderQuestionLi(day, q) {
  const examLink = massageExamLink(q, bootstrap.questionIntegrations);
  const li = el('li', { id: `home-q-${day.id}-${q.id}` }, [
    el('h3', {}, [qLabel(q)]),
    el('p', { className: 'my-status meta-line' }, ['']),
    el('p', { className: 'peer-status meta-line' }, ['']),
    el('p', { className: 'practice-tip meta-line' }, [practiceTipText(q)]),
    el('div', { className: 'button-row' }, [
      el('button', { type: 'button', className: 'toggle-select' }, [
        el('span', { className: 'toggle-text' }, ['選擇']),
        el('span', { className: 'vh' }, qLabel(q)),
      ]),
      el('a', { href: examLink.href, className: 'link-action' }, massageExamLinkText(examLink, q)),
      el('a', { href: `record.html?q=${encodeURIComponent(q.id)}&from=direct`, className: 'link-action' }, [
        '新增練習紀錄',
        el('span', { className: 'vh' }, `：${qLabel(q)}`),
      ]),
    ]),
  ]);
  return li;
}

async function onToggle(li, day, q) {
  const button = li.querySelector('.toggle-select');
  await handleToggle({
    button,
    bootstrap,
    identity,
    dayId: day.id,
    q,
    refresh: () => {
      refreshQuestionLi(li, day, q);
      refreshDayCount(day);
    },
    buildMessage: (wasSelected) => {
      const remaining = currentRemainingFor(day);
      const countClause = `${day.label}已選 ${remaining.selectedCount} 題。`;
      return wasSelected ? `已取消${qLabel(q)}。${countClause}` : `已選擇${qLabel(q)}。${countClause}`;
    },
  });
}

// 「今天：」／「下一次練習：」前綴＋日期（10月9日 星期五），見 PROJECT_SPEC §4.7。
// h2 與切換按鈕共用這段文字（按鈕另外加「（目前顯示）」後綴，見 dayButtonText）。
function dayHeadingText(day, featuredInfo) {
  let prefix = '';
  if (featuredInfo && featuredInfo.id === day.id) {
    prefix = featuredInfo.kind === 'today' ? '今天：' : '下一次練習：';
  }
  const dateText = day.date ? `（${formatDateWithWeekday(day.date)}）` : '';
  return `${prefix}${day.label} ${day.theme}${dateText}`;
}

// 切換按鈕文字：跟 h2 同一套文字，選中的那顆額外加「（目前顯示）」——
// aria-current 給報讀器，這段可見文字給看不清底色差異的低視能使用者（不能只靠顏色）。
function dayButtonText(day, featuredInfo, isSelected) {
  const base = dayHeadingText(day, featuredInfo);
  return isSelected ? `${base}（目前顯示）` : base;
}

function buildDaySwitcher() {
  daySwitcher.textContent = '';
  dayButtonEls.clear();
  for (const day of orderedDays) {
    const button = el('button', { type: 'button', className: 'day-switch-button' }, ['']);
    button.addEventListener('click', () => selectDay(day.id));
    dayButtonEls.set(day.id, button);
    daySwitcher.appendChild(button);
  }
  updateDaySwitcherButtons();
}

function updateDaySwitcherButtons() {
  for (const day of orderedDays) {
    const button = dayButtonEls.get(day.id);
    const isSelected = day.id === currentDayId;
    button.textContent = dayButtonText(day, featured, isSelected);
    if (isSelected) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}

// 切換顯示哪一天：只切 hidden＋把焦點移到新顯示區塊的 h2（不呼叫 announce()，
// 避免同一句話畫面文字與 live region 各播一次，見 ACCESSIBILITY §4 鐵則1／鐵則4）。
function selectDay(dayId) {
  if (dayId === currentDayId) return;
  currentDayId = dayId;
  for (const day of orderedDays) {
    const section = document.getElementById(`day-block-${day.id}`);
    if (section) section.hidden = day.id !== dayId;
  }
  updateDaySwitcherButtons();
  const heading = document.getElementById(`day-heading-${dayId}`);
  if (heading) heading.focus();
}

function renderDayBlock(day, featuredInfo, isInitiallyVisible) {
  const section = el('section', { className: 'day-block', id: `day-block-${day.id}`, hidden: !isInitiallyVisible }, [
    el('h2', { id: `day-heading-${day.id}`, tabindex: '-1' }, [dayHeadingText(day, featuredInfo)]),
    el('p', { className: 'day-count', id: `day-count-${day.id}` }, ['']),
  ]);
  const ul = el('ul', { className: 'question-list' });
  const questions = day.questionIds.map((id) => bootstrap.questions.find((q) => q.id === id)).filter(Boolean);
  for (const q of questions) {
    const li = renderQuestionLi(day, q);
    ul.appendChild(li);
    refreshQuestionLi(li, day, q);
    li.querySelector('.toggle-select').addEventListener('click', () => onToggle(li, day, q));
  }
  section.appendChild(ul);
  daysOverview.appendChild(section);
  refreshDayCount(day);
}

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
    const reason = e && e.message ? `原因：${e.message}` : '請重新整理頁面再試一次。';
    showError(`資料載入失敗。${reason}`);
    return;
  }

  renderWhoami(bootstrap.participants);
  hideLoading();
  homeContent.hidden = false;
  document.getElementById('acupoint-link').href = acupointCoachLink().href;
  document.getElementById('overview-round').textContent = `目前第 ${bootstrap.settings.currentRound} 輪。`;

  // 按鈕／區塊順序固定 1→5（不用「今天優先」排序）；只借 orderDaysForToday 的 featured 判斷
  // 決定初始顯示哪一天：今天有練習→今天；否則→下一次練習；都沒有→最後一天（第五天）。
  orderedDays = (bootstrap.days || []).slice().sort((a, b) => a.order - b.order);
  const orderResult = orderDaysForToday(bootstrap.days, todayInTaipei());
  featured = orderResult.featured;
  currentDayId = featured ? featured.id : orderedDays[orderedDays.length - 1].id;

  for (const day of orderedDays) {
    renderDayBlock(day, featured, day.id === currentDayId);
  }
  buildDaySwitcher();
}

init();
