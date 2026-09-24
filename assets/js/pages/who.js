import { getBootstrap, verifyAccess, addParticipant } from '../api/index.js';
import { el, announce, showError, clearError, isBusy, setBusyText, hideLoading } from '../ui/dom.js';
import { setIdentity, getStoredAccessCode, setVerifiedAccessCode } from '../ui/session.js';
import { activeMembers } from '../ui/layout.js';
import { config } from '../config.js';

const accessSection = document.getElementById('access-section');
const identitySection = document.getElementById('identity-section');
const identityHeading = document.getElementById('identity-heading');
const newParticipantSection = document.getElementById('new-participant-section');
const accessForm = document.getElementById('access-form');
const accessInput = document.getElementById('access-code');
const accessError = document.getElementById('access-code-error');
const identityForm = document.getElementById('identity-form');
const memberList = document.getElementById('member-list');
const newParticipantForm = document.getElementById('new-participant-form');
const displayNameInput = document.getElementById('display-name');
const displayNameError = document.getElementById('display-name-error');

function setAccessCodeError(message) {
  if (message) {
    accessInput.setAttribute('aria-invalid', 'true');
    accessError.textContent = message;
    accessError.hidden = false;
  } else {
    accessInput.removeAttribute('aria-invalid');
    accessError.textContent = '';
    accessError.hidden = true;
  }
}

function setDisplayNameError(message) {
  if (message) {
    displayNameInput.setAttribute('aria-invalid', 'true');
    displayNameInput.setAttribute('aria-describedby', 'display-name-hint display-name-error');
    displayNameError.textContent = message;
    displayNameError.hidden = false;
  } else {
    displayNameInput.removeAttribute('aria-invalid');
    displayNameInput.setAttribute('aria-describedby', 'display-name-hint');
    displayNameError.textContent = '';
    displayNameError.hidden = true;
  }
}

let bootstrap = null;
let verifiedAccessCode = getStoredAccessCode();

function renderMemberList(members) {
  memberList.textContent = '';
  for (const member of members) {
    const id = `member-${member.id}`;
    const input = el('input', { type: 'radio', name: 'participant', value: member.id, id });
    const label = el('label', { for: id }, [input, member.displayName]);
    memberList.appendChild(el('li', {}, [label]));
  }
}

function revealAfterAccessVerified() {
  accessSection.hidden = true;
  identitySection.hidden = false;
  newParticipantSection.hidden = false;
  renderMemberList(activeMembers(bootstrap.members, bootstrap.participants));
  // S1 修正：區塊被隱藏、換成下一步區塊時，焦點移到下一步區塊的標題（tabindex="-1"），
  // 不讓焦點掉到 <body>／頁首重新開始。
  identityHeading.focus();
}

async function init() {
  // 只有已經驗證過通行碼的裝置才在頁面載入時就抓資料；appsScript 後端每個請求都要帶通行碼（PROJECT_SPEC §6），
  // 還沒輸入通行碼的裝置要等通行碼表單送出成功後才抓（見下方 accessForm 的送出處理），這種情況畫面上不會有
  // 任何資料在載入，「資料載入中…」要立刻收起，讓通行碼表單可以馬上操作。
  if (!verifiedAccessCode) {
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
  hideLoading();
  revealAfterAccessVerified();
}

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  setAccessCodeError('');
  const code = accessInput.value.trim();
  if (!code) {
    setAccessCodeError('請輸入群組通行碼。');
    accessInput.focus();
    return;
  }
  const button = accessForm.querySelector('button[type="submit"]');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '確認中…');
  try {
    await verifyAccess(code);
    verifiedAccessCode = code;
    setVerifiedAccessCode(config.groupId, code);
    bootstrap = await getBootstrap();
    restore();
    // S1 修正：標題會接著被唸出，不用再說「請選擇你是誰」。
    announce('通行碼正確。');
    revealAfterAccessVerified();
  } catch (err) {
    restore();
    setAccessCodeError((err && err.message) || '通行碼不正確，請再確認一次。');
    accessInput.focus();
  }
});

accessInput.addEventListener('input', () => setAccessCodeError(''));

identityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();
  const checked = identityForm.querySelector('input[name="participant"]:checked');
  if (!checked) {
    showError('請先選擇你是誰。');
    return;
  }
  setIdentity({ groupId: config.groupId, participantId: checked.value, accessCode: verifiedAccessCode });
  window.location.href = 'index.html';
});

newParticipantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  setDisplayNameError('');
  const name = displayNameInput.value.trim();
  if (!name) {
    setDisplayNameError('請輸入顯示名稱。');
    displayNameInput.focus();
    return;
  }
  const button = newParticipantForm.querySelector('button[type="submit"]');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '加入中…');
  try {
    const { participant } = await addParticipant({ displayName: name });
    setIdentity({ groupId: config.groupId, participantId: participant.id, accessCode: verifiedAccessCode });
    window.location.href = 'index.html';
  } catch (err) {
    setDisplayNameError((err && err.message) || '加入失敗，請再試一次。');
    restore();
    displayNameInput.focus();
  }
});

displayNameInput.addEventListener('input', () => setDisplayNameError(''));

init();
