import { getBootstrap, addParticipant, updateMemberStatus, updateSettings } from '../api/index.js';
import { el, announce, showError, clearError, setBusy, clearBusy, isBusy, setBusyText, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const groupContent = document.getElementById('group-content');
const memberList = document.getElementById('member-list');
const addForm = document.getElementById('add-participant-form');
const newNameInput = document.getElementById('new-display-name');
const newNameError = document.getElementById('new-display-name-error');
const addParticipantResult = document.getElementById('add-participant-result');
const dayForm = document.getElementById('today-day-form');
const daySelect = document.getElementById('today-day-select');
const todayDayResult = document.getElementById('today-day-result');
const limitForm = document.getElementById('selection-limit-form');
const limitSelect = document.getElementById('selection-limit-select');
const selectionLimitResult = document.getElementById('selection-limit-result');
const overview = document.getElementById('today-overview');

function setNewNameError(message) {
  if (message) {
    newNameInput.setAttribute('aria-invalid', 'true');
    newNameInput.setAttribute('aria-describedby', 'new-display-name-hint new-display-name-error');
    newNameError.textContent = message;
    newNameError.hidden = false;
  } else {
    newNameInput.removeAttribute('aria-invalid');
    newNameInput.setAttribute('aria-describedby', 'new-display-name-hint');
    newNameError.textContent = '';
    newNameError.hidden = true;
  }
}

let bootstrap = null;
let identity = null;

const STATUS_LABEL = { active: '練習中', paused: '暫停', left: '已退出' };

function participantName(participantId) {
  const p = bootstrap.participants.find((item) => item.id === participantId);
  return p ? p.displayName : '（未知成員）';
}

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

// 暫停／恢復共用同一顆「切換」按鈕（文字隨狀態改變），「退出」是獨立按鈕；
// 兩顆按鈕一開始就都建立好，之後只切換文字／顯示，不整組換掉，焦點才不會亂跳（里程碑審查決議）。
function buildMemberButtons(member, name) {
  const toggleButton = el('button', { type: 'button', className: 'secondary toggle-status', 'data-status': member.status }, [
    el('span', { className: 'toggle-text' }, [member.status === 'active' ? '暫停' : '恢復']),
    el('span', { className: 'vh' }, `：${name}`),
  ]);
  const leaveButton = el(
    'button',
    { type: 'button', className: 'secondary leave-button', hidden: member.status === 'left' },
    ['退出', el('span', { className: 'vh' }, `：${name}`)],
  );

  toggleButton.addEventListener('click', () => {
    const target = toggleButton.dataset.status === 'active' ? 'paused' : 'active';
    onChangeStatus(toggleButton, member.participantId, target, false, name);
  });
  leaveButton.addEventListener('click', () => onChangeStatus(leaveButton, member.participantId, 'left', true, name));

  return el('div', { className: 'button-row' }, [toggleButton, leaveButton]);
}

function updateMemberButtons(li, member) {
  const toggleButton = li.querySelector('.toggle-status');
  const leaveButton = li.querySelector('.leave-button');
  toggleButton.dataset.status = member.status;
  toggleButton.querySelector('.toggle-text').textContent = member.status === 'active' ? '暫停' : '恢復';
  leaveButton.hidden = member.status === 'left';
}

async function onChangeStatus(button, participantId, newStatus, needsConfirm, name) {
  if (isBusy(button)) return;
  if (needsConfirm) {
    const confirmed = window.confirm(`確定要將${name}標記為退出嗎？`);
    if (!confirmed) return;
  }
  clearError();
  setBusy(button);
  try {
    const { member } = await updateMemberStatus({ participantId, status: newStatus });
    const idx = bootstrap.members.findIndex((m) => m.participantId === participantId);
    if (idx >= 0) bootstrap.members[idx] = member;
    clearBusy(button);
    const li = document.getElementById(`member-${participantId}`);
    li.querySelector('.member-status').textContent = STATUS_LABEL[member.status] || member.status;
    updateMemberButtons(li, member);
    // 按鈕就地更新，焦點通常留在原按鈕；只有「退出」讓自己消失時，才移到成員名稱（tabindex="-1"）。
    if (button.hidden) {
      document.getElementById(`member-name-${participantId}`).focus();
    }
    renderOverview();
    announce(`已將${name}的狀態改為${STATUS_LABEL[newStatus]}。`);
  } catch (err) {
    clearBusy(button);
    showError((err && err.message) || '操作失敗，請再試一次。');
  }
}

function buildMemberLi(member) {
  const name = participantName(member.participantId);
  const li = el('li', { id: `member-${member.participantId}` }, [
    el('p', { id: `member-name-${member.participantId}`, tabindex: '-1' }, [el('strong', {}, [name])]),
    el('p', { className: 'member-status meta-line' }, [STATUS_LABEL[member.status] || member.status]),
    buildMemberButtons(member, name),
  ]);
  return li;
}

function renderMembers() {
  memberList.textContent = '';
  for (const member of bootstrap.members) {
    memberList.appendChild(buildMemberLi(member));
  }
}

function populateDaySelect() {
  daySelect.textContent = '';
  const sortedDays = bootstrap.days.slice().sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    const option = el('option', { value: day.id }, [`${day.label} ${day.theme}`]);
    daySelect.appendChild(option);
  }
  daySelect.value = bootstrap.settings.currentDayId;
}

function populateLimitSelect() {
  limitSelect.value = String(bootstrap.settings.selectionLimit);
}

function renderOverview() {
  overview.textContent = '';
  const day = bootstrap.days.find((d) => d.id === bootstrap.settings.currentDayId);
  const round = bootstrap.settings.currentRound;
  const heading = document.getElementById('today-overview-heading');
  heading.textContent = day ? `大家的選題：${day.label} ${day.theme}` : '大家的選題';

  const activeMembers = bootstrap.members.filter((m) => m.status === 'active');
  if (activeMembers.length === 0) {
    overview.appendChild(el('p', {}, ['目前沒有練習中的成員。']));
    return;
  }
  for (const member of activeMembers) {
    const name = participantName(member.participantId);
    const mySelections = bootstrap.selections.filter(
      (s) => s.participantId === member.participantId && s.dayId === day?.id && s.round === round && !s.canceledAt,
    );
    overview.appendChild(el('h3', {}, [name]));
    if (mySelections.length === 0) {
      overview.appendChild(el('p', {}, ['尚未選題。']));
      continue;
    }
    const texts = mySelections
      .map((s) => bootstrap.questions.find((q) => q.id === s.questionId))
      .filter(Boolean)
      .map(qLabel);
    overview.appendChild(el('p', {}, [texts.join('、')]));
  }
}

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  setNewNameError('');
  addParticipantResult.textContent = '';
  const name = newNameInput.value.trim();
  if (!name) {
    setNewNameError('請輸入顯示名稱。');
    newNameInput.focus();
    return;
  }
  const button = addForm.querySelector('button[type="submit"]');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '新增中…');
  try {
    const { participant, member } = await addParticipant({ displayName: name });
    bootstrap.participants.push(participant);
    bootstrap.members.push(member);
    memberList.appendChild(buildMemberLi(member));
    renderOverview();
    newNameInput.value = '';
    restore();
    // S4：除了 #status 播報，表單按鈕旁也留一行看得見的結果文字，200% 縮放或手機上也看得到。
    addParticipantResult.textContent = `已新增同學：${participant.displayName}。`;
    announce(`已新增同學：${participant.displayName}。`);
  } catch (err) {
    restore();
    setNewNameError((err && err.message) || '新增失敗，請再試一次。');
    newNameInput.focus();
  }
});

newNameInput.addEventListener('input', () => setNewNameError(''));

dayForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  todayDayResult.textContent = '';
  const button = dayForm.querySelector('button[type="submit"]');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '儲存中…');
  try {
    const { settings } = await updateSettings({ currentDayId: daySelect.value });
    bootstrap.settings = settings;
    renderOverview();
    restore();
    const day = bootstrap.days.find((d) => d.id === settings.currentDayId);
    const label = day ? `${day.label} ${day.theme}` : '';
    todayDayResult.textContent = `已更新今天題組：${label}。`;
    announce(`已更新今天題組：${label}。`);
  } catch (err) {
    restore();
    showError((err && err.message) || '儲存失敗，請再試一次。');
  }
});

limitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  selectionLimitResult.textContent = '';
  const raw = limitSelect.value;
  const value = raw === 'unlimited' ? 'unlimited' : Number(raw);
  const button = limitForm.querySelector('button[type="submit"]');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '儲存中…');
  try {
    const { settings } = await updateSettings({ selectionLimit: value });
    bootstrap.settings = settings;
    restore();
    const text = value === 'unlimited' ? '不限' : `${value} 題`;
    selectionLimitResult.textContent = `已更新建議選題數：${text}。`;
    announce(`已更新建議選題數：${text}。`);
  } catch (err) {
    restore();
    showError((err && err.message) || '儲存失敗，請再試一次。');
  }
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
  groupContent.hidden = false;

  renderMembers();
  populateDaySelect();
  populateLimitSelect();
  renderOverview();
}

init();
