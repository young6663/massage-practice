import { getBootstrap, selectQuestion, cancelSelection } from '../api/index.js';
import { el, announce, showError, clearError, setBusy, clearBusy, isBusy, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { remainingForDay, questionStats, todayInTaipei } from '../domain/progress.js';
import { familiarityLabel, familiarityCssClass } from '../constants.js';
import { massageExamLink, massageExamLinkText } from '../integrations.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const dayContent = document.getElementById('day-content');
const questionListEl = document.getElementById('question-list');

const params = new URLSearchParams(window.location.search);
const dayId = params.get('d');

let bootstrap = null;
let identity = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

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

function findMySelection(questionId) {
  return bootstrap.selections.find(
    (s) =>
      s.participantId === identity.participantId &&
      s.dayId === dayId &&
      s.questionId === questionId &&
      s.round === bootstrap.settings.currentRound &&
      !s.canceledAt,
  );
}

function peerNamesFor(questionId) {
  const activeSelections = bootstrap.selections.filter(
    (s) => s.dayId === dayId && s.questionId === questionId && s.round === bootstrap.settings.currentRound && !s.canceledAt,
  );
  const names = activeSelections
    .map((s) => bootstrap.participants.find((p) => p.id === s.participantId))
    .filter(Boolean)
    .map((p) => p.displayName);
  return names;
}

function renderMyStatus(li, questionId) {
  const mySel = findMySelection(questionId);
  const node = li.querySelector('.my-status');
  node.textContent = mySel ? '你已選擇' : '你未選擇';
  li.classList.toggle('selected', !!mySel);
  return mySel;
}

function renderPeerStatus(li, questionId) {
  const names = peerNamesFor(questionId);
  const node = li.querySelector('.peer-status');
  node.textContent = names.length > 0 ? `${names.length} 人選擇：${names.join('、')}` : '還沒有人選';
}

function renderToggleButton(li, q, mySel) {
  const button = li.querySelector('.toggle-select');
  button.querySelector('.toggle-text').textContent = mySel ? '取消選擇' : '選擇';
  button.dataset.selected = mySel ? 'true' : 'false';
  // 主要動作（選擇）實心；次要動作（取消選擇）白底主色框線，兩者看得出差別（ACCESSIBILITY §8）。
  // 注意：force 參數要傳真正的 boolean，傳 undefined 會被當成「沒給 force」變成單純 toggle（每次都加）。
  button.classList.toggle('secondary', !!mySel);
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
  renderPeerStatus(li, q.id);
  renderToggleButton(li, q, mySel);
}

async function onToggle(li, q) {
  const button = li.querySelector('.toggle-select');
  if (isBusy(button)) return;
  const wasSelected = button.dataset.selected === 'true';
  // 選擇／取消是短操作：忙碌中不換按鈕文字，完成後才由 refreshQuestionLi 換成新狀態文字。
  setBusy(button);
  clearError();
  try {
    if (wasSelected) {
      const mySel = findMySelection(q.id);
      const { daySelections } = await cancelSelection({ participantId: identity.participantId, selectionId: mySel.id });
      bootstrap.selections = mergeDaySelections(bootstrap.selections, daySelections, dayId);
      clearBusy(button);
      refreshQuestionLi(li, q);
      const remaining = currentRemaining();
      document.getElementById('intro-sentence').textContent = introSentence(remaining);
      announce(`已取消${qLabel(q)}。${progressClause(remaining)}`);
    } else {
      const { daySelections } = await selectQuestion({
        participantId: identity.participantId,
        dayId,
        questionId: q.id,
      });
      bootstrap.selections = mergeDaySelections(bootstrap.selections, daySelections, dayId);
      clearBusy(button);
      refreshQuestionLi(li, q);
      const remaining = currentRemaining();
      document.getElementById('intro-sentence').textContent = introSentence(remaining);
      announce(`已選擇${qLabel(q)}。${progressClause(remaining)}`);
    }
  } catch (err) {
    clearBusy(button);
    showError((err && err.message) || '操作失敗，資料沒有送出，請再試一次。');
  }
}

// 把某一天最新的有效選題結果併回整體 selections（其餘天數的資料保持不動）。
function mergeDaySelections(allSelections, daySelections, targetDayId) {
  const others = allSelections.filter((s) => s.dayId !== targetDayId);
  const sameDayOthers = allSelections.filter((s) => s.dayId === targetDayId && s.canceledAt);
  const activeIds = new Set(daySelections.map((s) => s.id));
  const keptCanceled = sameDayOthers.filter((s) => !activeIds.has(s.id));
  return others.concat(keptCanceled, daySelections);
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
