import { getBootstrap, createSession } from '../api/index.js';
import { el, showError, clearError, isBusy, setBusyText, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { todayInTaipei } from '../domain/progress.js';
import { FAMILIARITY_LEVELS, WEAKNESS_CATEGORIES } from '../constants.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const recordContent = document.getElementById('record-content');
const form = document.getElementById('record-form');
const errorSummary = document.getElementById('error-summary');
const errorList = document.getElementById('error-list');
const errorCount = document.getElementById('error-count');
const familiarityError = document.getElementById('familiarity-error');
const practicedAtInput = document.getElementById('practiced-at');

// S3／S4：欄位旁的錯誤文字。熟悉程度是 fieldset/legend，不用 aria-describedby（不可靠），
// 直接把「錯誤：…」文字接在 legend 裡，NVDA／VoiceOver／TalkBack 都一定會唸到。
function setFamiliarityError(message) {
  familiarityError.textContent = message ? `錯誤：${message}` : '';
}

// 日期／卡在哪裡／備註都是單一輸入欄位，用 aria-invalid + aria-describedby 指向欄位下方的錯誤段落。
function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${fieldId}-error`);
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function clearAllFieldErrors() {
  setFamiliarityError('');
  setFieldError('practiced-at', '');
  setFieldError('stuck-point', '');
  setFieldError('note', '');
}

// 依訊息內容判斷是哪個欄位的錯誤，讓伺服器回傳的欄位類錯誤（S4）也能走欄位級錯誤＋摘要，
// 而不是只在頁首的 #error 顯示。
function classifyServerError(message) {
  if (message.includes('熟悉程度')) return { fieldId: 'familiarity-1', kind: 'familiarity' };
  if (message.includes('日期')) return { fieldId: 'practiced-at', kind: 'field' };
  if (message.includes('卡在哪裡')) return { fieldId: 'stuck-point', kind: 'field' };
  if (message.includes('備註')) return { fieldId: 'note', kind: 'field' };
  return null;
}

const params = new URLSearchParams(window.location.search);
const questionId = params.get('q');
const fromParam = params.get('from') || 'direct';

let bootstrap = null;
let identity = null;
let question = null;
let selectionId = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

function renderFamiliarityOptions() {
  const list = document.getElementById('familiarity-options');
  list.textContent = '';
  for (const level of FAMILIARITY_LEVELS) {
    const id = `familiarity-${level.value}`;
    const input = el('input', { type: 'radio', name: 'familiarity', id, value: level.value });
    const label = el('label', { for: id }, [input, level.label]);
    list.appendChild(el('li', {}, [label]));
  }
}

function renderWeaknessOptions() {
  const list = document.getElementById('weakness-options');
  list.textContent = '';
  for (const w of WEAKNESS_CATEGORIES) {
    const id = `weakness-${w.code}`;
    const input = el('input', { type: 'checkbox', name: 'weaknessCodes', id, value: w.code });
    const label = el('label', { for: id }, [input, w.label]);
    list.appendChild(el('li', {}, [label]));
  }
}

function clearFieldErrors() {
  errorSummary.hidden = true;
  errorList.textContent = '';
  clearAllFieldErrors();
}

function showFieldErrors(errors) {
  errorList.textContent = '';
  errorCount.textContent = String(errors.length);
  for (const e of errors) {
    const li = el('li', {}, [el('a', { href: `#${e.fieldId}` }, [e.message])]);
    errorList.appendChild(li);
    // 同時標記欄位本身（S3）：熟悉程度接在 legend，其餘欄位用 aria-invalid + aria-describedby。
    if (e.fieldId === 'familiarity-1') setFamiliarityError(e.message);
    else setFieldError(e.fieldId, e.message);
  }
  errorSummary.hidden = false;
  errorSummary.focus();
}

// A9：摘要連結先 preventDefault，再把焦點移到欄位本身並捲動到 fieldset／欄位開頭，
// 避免 Chromium 把整個畫面捲到欄位置中，導致 legend／label 被捲出畫面外。
errorList.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const targetId = link.getAttribute('href').slice(1);
  const field = document.getElementById(targetId);
  if (!field) return;
  event.preventDefault();
  const container = field.closest('fieldset') || field;
  container.scrollIntoView({ block: 'start' });
  field.focus();
});

function findMatchingSelectionId() {
  if (fromParam !== 'selection') return null;
  const round = bootstrap.settings.currentRound;
  const sel = bootstrap.selections.find(
    (s) =>
      s.participantId === identity.participantId &&
      s.questionId === questionId &&
      s.round === round &&
      !s.canceledAt,
  );
  return sel ? sel.id : null;
}

function sourceFromParam() {
  if (fromParam === 'selection') return 'selection';
  if (fromParam === 'draw') return 'draw';
  return 'direct';
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
  selectionId = findMatchingSelectionId();

  // A10：h1 與按鈕名稱已經包含題名，拿掉原本緊接在 h1 後面又唸一次題名的段落。
  const label = qLabel(question);
  document.getElementById('page-heading').textContent = `新增${label}練習紀錄`;
  document.getElementById('page-title-tag').textContent = `新增${label}練習紀錄｜乙級上岸練習`;

  renderFamiliarityOptions();
  renderWeaknessOptions();
  const today = todayInTaipei();
  practicedAtInput.value = today;
  // S4：加 max（今天）先擋掉未來日期，伺服器驗證仍是最後一道防線。
  practicedAtInput.max = today;
  document.getElementById('submit-button').textContent = `儲存${label}練習紀錄`;

  hideLoading();
  recordContent.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  clearFieldErrors();

  const familiarityInput = form.querySelector('input[name="familiarity"]:checked');
  const practicedAt = document.getElementById('practiced-at').value;
  const errors = [];
  if (!familiarityInput) {
    errors.push({ fieldId: 'familiarity-1', message: '請選擇熟悉程度' });
  }
  if (!practicedAt) {
    errors.push({ fieldId: 'practiced-at', message: '請填寫練習日期' });
  }
  if (errors.length > 0) {
    showFieldErrors(errors);
    return;
  }

  const weaknessCodes = Array.from(form.querySelectorAll('input[name="weaknessCodes"]:checked')).map((i) => i.value);
  const stuckPoint = document.getElementById('stuck-point').value.trim();
  const note = document.getElementById('note').value.trim();

  const button = document.getElementById('submit-button');
  if (isBusy(button)) return;
  const restore = setBusyText(button, '儲存中…');
  try {
    const { session } = await createSession({
      participantId: identity.participantId,
      questionId,
      practicedAt,
      familiarity: Number(familiarityInput.value),
      weaknessCodes,
      stuckPoint,
      note,
      source: sourceFromParam(),
      selectionId,
    });
    window.location.href = `question.html?q=${encodeURIComponent(questionId)}&saved=${encodeURIComponent(session.id)}`;
  } catch (err) {
    restore();
    const message = (err && err.message) || '儲存失敗，資料沒有送出，請再試一次。';
    // S4：伺服器回傳的欄位類錯誤（日期、字數、熟悉程度）改走錯誤摘要＋欄位錯誤，
    // 不要只用頁首的 showError，200% 縮放或手機上才看得到錯在哪裡。
    const classified = classifyServerError(message);
    if (classified) {
      showFieldErrors([{ fieldId: classified.fieldId, message }]);
    } else {
      showError(message);
    }
  }
});

// 欄位修正後清掉對應的錯誤文字與 aria-invalid（S3）。熟悉程度的 radio 是 renderFamiliarityOptions()
// 動態產生的，掛在 form 上用事件代理，才不會漏掉之後才建立的元素。
form.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'familiarity') setFamiliarityError('');
});
practicedAtInput.addEventListener('change', () => setFieldError('practiced-at', ''));
document.getElementById('stuck-point').addEventListener('input', () => setFieldError('stuck-point', ''));
document.getElementById('note').addEventListener('input', () => setFieldError('note', ''));

init();
