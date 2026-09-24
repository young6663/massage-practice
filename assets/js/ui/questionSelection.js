// 共用：單題「選擇／取消選擇」的渲染規則與 API 呼叫。day.js 與 home.js（五天選題總覽）共用，
// 避免兩處各自維護一份選題狀態顯示與切換邏輯（ACCESSIBILITY §3/§4）。
import { selectQuestion, cancelSelection } from '../api/index.js';
import { announce, showError, clearError, setBusy, clearBusy, isBusy } from './dom.js';

export function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

export function findMySelection(selections, participantId, dayId, questionId, round) {
  return selections.find(
    (s) =>
      s.participantId === participantId &&
      s.dayId === dayId &&
      s.questionId === questionId &&
      s.round === round &&
      !s.canceledAt,
  );
}

export function peerNamesFor(selections, participants, dayId, questionId, round) {
  const activeSelections = selections.filter(
    (s) => s.dayId === dayId && s.questionId === questionId && s.round === round && !s.canceledAt,
  );
  return activeSelections
    .map((s) => (participants || []).find((p) => p.id === s.participantId))
    .filter(Boolean)
    .map((p) => p.displayName);
}

// 把某一天最新的有效選題結果併回整體 selections（其餘天數的資料保持不動）。
export function mergeDaySelections(allSelections, daySelections, targetDayId) {
  const others = allSelections.filter((s) => s.dayId !== targetDayId);
  const sameDayOthers = allSelections.filter((s) => s.dayId === targetDayId && s.canceledAt);
  const activeIds = new Set(daySelections.map((s) => s.id));
  const keptCanceled = sameDayOthers.filter((s) => !activeIds.has(s.id));
  return others.concat(keptCanceled, daySelections);
}

// 就地更新按鈕文字與 data-selected（主要動作選擇＝實心，次要動作取消選擇＝白底框線，ACCESSIBILITY §8）。
export function renderToggleButton(button, mySel) {
  button.querySelector('.toggle-text').textContent = mySel ? '取消選擇' : '選擇';
  button.dataset.selected = mySel ? 'true' : 'false';
  button.classList.toggle('secondary', !!mySel);
}

// 呼叫 selectQuestion／cancelSelection，並把結果併回 bootstrap.selections。呼叫端負責重新渲染與播報。
async function toggleSelectionApi({ bootstrap, identity, dayId, questionId, wasSelected, mySelectionId }) {
  let daySelections;
  if (wasSelected) {
    ({ daySelections } = await cancelSelection({ participantId: identity.participantId, selectionId: mySelectionId }));
  } else {
    ({ daySelections } = await selectQuestion({ participantId: identity.participantId, dayId, questionId }));
  }
  bootstrap.selections = mergeDaySelections(bootstrap.selections, daySelections, dayId);
}

// 共用的「按下選擇／取消選擇按鈕」處理流程：忙碌保護、呼叫 API、呼叫端 refresh() 更新畫面、
// 最後用 buildMessage(wasSelected) 產生的句子播報一次（ACCESSIBILITY §4：處理中不換按鈕文字、不用 disabled）。
export async function handleToggle({ button, bootstrap, identity, dayId, q, refresh, buildMessage }) {
  if (isBusy(button)) return;
  const round = bootstrap.settings.currentRound;
  const wasSelected = button.dataset.selected === 'true';
  const mySel = findMySelection(bootstrap.selections, identity.participantId, dayId, q.id, round);
  setBusy(button);
  clearError();
  try {
    await toggleSelectionApi({
      bootstrap,
      identity,
      dayId,
      questionId: q.id,
      wasSelected,
      mySelectionId: mySel ? mySel.id : null,
    });
    clearBusy(button);
    refresh();
    announce(buildMessage(wasSelected));
  } catch (err) {
    clearBusy(button);
    showError((err && err.message) || '操作失敗，資料沒有送出，請再試一次。');
  }
}
