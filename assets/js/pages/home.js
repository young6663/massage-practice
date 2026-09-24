// 首頁＝五天選題總覽：主要用途是「看每天大家選了誰、選自己的題」，其餘功能移到頁尾「其他功能」。
import { getBootstrap } from '../api/index.js';
import { el, showError, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { acupointCoachLink } from '../integrations.js';
import { remainingForDay, todayInTaipei, orderDaysForToday, formatDateWithWeekday } from '../domain/progress.js';
import { qLabel, findMySelection, peerNamesFor, renderToggleButton, handleToggle } from '../ui/questionSelection.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const homeContent = document.getElementById('home-content');
const daysOverview = document.getElementById('days-overview');

let bootstrap = null;
let identity = null;

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

function refreshQuestionLi(li, day, q) {
  const mySel = renderMyStatus(li, day, q);
  renderPeerStatus(li, day, q);
  renderToggleButton(li.querySelector('.toggle-select'), mySel);
}

function refreshDayCount(day) {
  document.getElementById(`day-count-${day.id}`).textContent = dayCountSentence(currentRemainingFor(day));
}

function renderQuestionLi(day, q) {
  const li = el('li', { id: `home-q-${day.id}-${q.id}` }, [
    el('h3', {}, [qLabel(q)]),
    el('p', { className: 'my-status meta-line' }, ['']),
    el('p', { className: 'peer-status meta-line' }, ['']),
    el('div', { className: 'button-row' }, [
      el('button', { type: 'button', className: 'toggle-select' }, [
        el('span', { className: 'toggle-text' }, ['選擇']),
        el('span', { className: 'vh' }, qLabel(q)),
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
function dayHeadingText(day, featured) {
  let prefix = '';
  if (featured && featured.id === day.id) {
    prefix = featured.kind === 'today' ? '今天：' : '下一次練習：';
  }
  const dateText = day.date ? `（${formatDateWithWeekday(day.date)}）` : '';
  return `${prefix}${day.label} ${day.theme}${dateText}`;
}

function renderDayBlock(day, featured) {
  const section = el('section', { className: 'day-block', id: `day-block-${day.id}` }, [
    el('h2', {}, [dayHeadingText(day, featured)]),
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
    showError('資料載入失敗，請重新整理頁面再試一次。');
    return;
  }

  renderWhoami(bootstrap.participants);
  hideLoading();
  homeContent.hidden = false;
  document.getElementById('acupoint-link').href = acupointCoachLink().href;
  document.getElementById('overview-round').textContent = `目前第 ${bootstrap.settings.currentRound} 輪。`;

  const { days: orderedDays, featured } = orderDaysForToday(bootstrap.days, todayInTaipei());
  for (const day of orderedDays) {
    renderDayBlock(day, featured);
  }
}

init();
