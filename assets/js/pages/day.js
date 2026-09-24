import { getBootstrap } from '../api/index.js';
import { el, showError, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { remainingForDay, questionStats, todayInTaipei } from '../domain/progress.js';
import { familiarityLabel, familiarityCssClass } from '../constants.js';
import { massageExamLink, massageExamLinkText } from '../integrations.js';
import { qLabel, findMySelection, peerNamesFor, renderToggleButton, handleToggle } from '../ui/questionSelection.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const dayContent = document.getElementById('day-content');
const questionListEl = document.getElementById('question-list');

const params = new URLSearchParams(window.location.search);
const dayId = params.get('d');

let bootstrap = null;
let identity = null;

function introSentence(remaining) {
  if (remaining.limit === 'unlimited') return `不限選題數，你已選 ${remaining.selectedCount} 題。`;
  return `建議每人選 ${remaining.limit} 題，你已選 ${remaining.selectedCount} 題。`;
}

function progressClause(remaining) {
  if (remaining.limit === 'unlimited') return `目前已選 ${remaining.selectedCount} 題。`;
  if (remaining.remaining > 0) return `今天還差 ${remaining.remaining} 題。`;
  if (remaining.selectedCount > remaining.limit) return `今天已選 ${remaining.selectedCount} 題，超過建議的 ${remaining.limit} 題。`;
  return `今天已選 ${remaining.selectedCount} 題，已達建議數量。`;
}

function currentRemaining() {
  return remainingForDay(
    bootstrap.selections,
    identity.participantId,
    dayId,
    bootstrap.settings.currentRound,
    bootstrap.settings.selectionLimit,
  );
}

function renderMyStatus(li, questionId) {
  const mySel = findMySelection(bootstrap.selections, identity.participantId, dayId, questionId, bootstrap.settings.currentRound);
  const node = li.querySelector('.my-status');
  node.textContent = mySel ? '你已選擇' : '你未選擇';
  li.classList.toggle('selected', !!mySel);
  return mySel;
}

function renderPeerStatusLi(li, questionId) {
  const names = peerNamesFor(bootstrap.selections, bootstrap.participants, dayId, questionId, bootstrap.settings.currentRound);
  const node = li.querySelector('.peer-status');
  node.textContent = names.length > 0 ? `${names.length} 人選擇：${names.join('、')}` : '還沒有人選';
}

function renderQuestionLi(q) {
  const today = todayInTaipei();
  const stats = questionStats(bootstrap.sessions, identity.participantId, q.id, {
    staleDays: bootstrap.settings.staleDays,
    today,
  });
  const famText = stats.count > 0 ? familiarityLabel(stats.latest.familiarity) : '尚未練過';
  const famClass = stats.count > 0 ? familiarityCssClass(stats.latest.familiarity) : 'fam-none';

  const examLink = massageExamLink(q, bootstrap.questionIntegrations);

  const li = el('li', { id: `q-${q.id}` }, [
    el('h3', {}, [qLabel(q)]),
    el('p', { className: 'my-status meta-line' }, ['']),
    el('p', { className: 'peer-status meta-line' }, ['']),
    el('p', { className: 'meta-line' }, ['你的熟悉程度：', el('span', { className: `badge ${famClass}` }, [famText])]),
    el('div', { className: 'button-row' }, [
      el('button', { type: 'button', className: 'toggle-select' }, [
        el('span', { className: 'toggle-text' }, ['選擇']),
        el('span', { className: 'vh' }, qLabel(q)),
      ]),
      el('a', { href: `question.html?q=${encodeURIComponent(q.id)}`, className: 'link-action' }, [
        '查看紀錄',
        el('span', { className: 'vh' }, `：${qLabel(q)}`),
      ]),
      el('a', { href: examLink.href, className: 'link-action' }, massageExamLinkText(examLink, q)),
      el('a', { href: `record.html?q=${encodeURIComponent(q.id)}&from=selection`, className: 'link-action' }, [
        '留下練習紀錄',
        el('span', { className: 'vh' }, `：${qLabel(q)}`),
      ]),
    ]),
  ]);

  return li;
}

function refreshQuestionLi(li, q) {
  const mySel = renderMyStatus(li, q.id);
  renderPeerStatusLi(li, q.id);
  renderToggleButton(li.querySelector('.toggle-select'), mySel);
}

async function onToggle(li, q) {
  const button = li.querySelector('.toggle-select');
  await handleToggle({
    button,
    bootstrap,
    identity,
    dayId,
    q,
    refresh: () => {
      refreshQuestionLi(li, q);
      document.getElementById('intro-sentence').textContent = introSentence(currentRemaining());
    },
    buildMessage: (wasSelected) => {
      const remaining = currentRemaining();
      return wasSelected ? `已取消${qLabel(q)}。${progressClause(remaining)}` : `已選擇${qLabel(q)}。${progressClause(remaining)}`;
    },
  });
}

async function init() {
  identity = getIdentity();
  if (!identity) {
    noIdentityNotice.hidden = false;
    hideLoading();
    return;
  }
  if (!dayId) {
    hideLoading();
    showError('缺少題組參數，請從首頁重新進入。');
    return;
  }

  try {
    bootstrap = await getBootstrap();
  } catch (e) {
    hideLoading();
    showError('資料載入失敗，請重新整理頁面再試一次。');
    return;
  }

  const day = bootstrap.days.find((d) => d.id === dayId);
  if (!day) {
    hideLoading();
    showError('找不到這個題組。');
    return;
  }

  renderWhoami(bootstrap.participants);

  const label = `${day.label} ${day.theme}`;
  document.getElementById('page-heading').textContent = `當日選題：${label}`;
  document.getElementById('page-title-tag').textContent = `當日選題：${label}｜乙級上岸練習`;

  hideLoading();
  dayContent.hidden = false;
  document.getElementById('intro-sentence').textContent = introSentence(currentRemaining());

  const questions = day.questionIds
    .map((id) => bootstrap.questions.find((q) => q.id === id))
    .filter(Boolean);

  const anyNonDeepLink = questions.some(
    (q) => !massageExamLink(q, bootstrap.questionIntegrations).isDeepLink,
  );
  document.getElementById('exam-note').hidden = !anyNonDeepLink;

  for (const q of questions) {
    const li = renderQuestionLi(q);
    questionListEl.appendChild(li);
    refreshQuestionLi(li, q);
    li.querySelector('.toggle-select').addEventListener('click', () => onToggle(li, q));
  }
}

init();
