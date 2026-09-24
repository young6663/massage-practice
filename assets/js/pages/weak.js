import { getBootstrap } from '../api/index.js';
import { el, announce, showError, hideLoading, debounce } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { weakList, unpracticedList, questionsByStatus, todayInTaipei } from '../domain/progress.js';
import { familiarityLabel, familiarityCssClass } from '../constants.js';
import { massageExamLink, massageExamLinkText } from '../integrations.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const weakContent = document.getElementById('weak-content');
const statusFilter = document.getElementById('status-filter');

let bootstrap = null;
let identity = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

function examLinkAnchor(q) {
  const examLink = massageExamLink(q, bootstrap.questionIntegrations);
  return el('a', { href: examLink.href, className: 'link-action' }, massageExamLinkText(examLink, q));
}

function viewRecordLink(q) {
  return el('a', { href: `question.html?q=${encodeURIComponent(q.id)}`, className: 'link-action' }, [
    '查看紀錄',
    el('span', { className: 'vh' }, `：${qLabel(q)}`),
  ]);
}

function addRecordLink(q) {
  return el('a', { href: `record.html?q=${encodeURIComponent(q.id)}&from=direct`, className: 'link-action' }, [
    '留下練習紀錄',
    el('span', { className: 'vh' }, `：${qLabel(q)}`),
  ]);
}

function statusBadge(stats) {
  const famText = stats.count > 0 ? familiarityLabel(stats.latest.familiarity) : '尚未練過';
  const famClass = stats.count > 0 ? familiarityCssClass(stats.latest.familiarity) : 'fam-none';
  return el('span', { className: `badge ${famClass}` }, [famText]);
}

function renderPriority(weak) {
  const list = document.getElementById('priority-list');
  const empty = document.getElementById('priority-empty');
  list.textContent = '';
  if (weak.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const item of weak) {
    const q = item.question;
    const li = el('li', {}, [
      el('h3', {}, [qLabel(q)]),
      el('p', { className: 'meta-line' }, [item.reason]),
      el('div', { className: 'button-row' }, [viewRecordLink(q), addRecordLink(q), examLinkAnchor(q)]),
    ]);
    list.appendChild(li);
  }
}

// S7 修正：這裡以前會把「尚未練過」的每一題都列出來（新同學可能有 40 題），擋在下面「依狀態查看」
// 篩選欄前面，NVDA／VoiceOver 使用者要一路 Tab／滑過去才能到篩選欄。改成只顯示題數，
// 想看完整清單改連去 40 題總表（帶 status=unpracticed 參數，all.js 會預選篩選條件）。
function renderUnpracticed(unpracticed) {
  const summary = document.getElementById('unpracticed-summary');
  const linkWrap = document.getElementById('unpracticed-link-wrap');
  linkWrap.textContent = '';
  if (unpracticed.length === 0) {
    summary.textContent = '每一題都至少練過一次了。';
    return;
  }
  summary.textContent = `共 ${unpracticed.length} 題尚未練過。`;
  linkWrap.appendChild(
    el('a', { href: 'all.html?status=unpracticed', className: 'link-action' }, ['在40題總表查看尚未練過的題目']),
  );
}

function renderStatusFilterList(items) {
  const container = document.getElementById('status-filter-list');
  container.textContent = '';
  for (const { question: q, stats } of items) {
    const li = el('li', {}, [
      el('p', {}, [`${qLabel(q)}　`, statusBadge(stats)]),
      el('div', { className: 'button-row' }, [viewRecordLink(q), examLinkAnchor(q)]),
    ]);
    container.appendChild(li);
  }
}

function parseStatusValue(value) {
  if (value === 'all' || value === 'unpracticed') return value;
  return Number(value);
}

// S7 修正：預設不選任何狀態（<option value="">請選擇狀態</option>），使用者選了狀態才列出清單，
// 避免「全部狀態」預設把 40 題再列一次。
function applyStatusFilter(shouldAnnounce) {
  const rawValue = statusFilter.value;
  const list = document.getElementById('status-filter-list');
  const summary = document.getElementById('status-filter-summary');
  if (!rawValue) {
    list.textContent = '';
    summary.textContent = '請先選擇狀態，才會顯示題目清單。';
    return;
  }
  const value = parseStatusValue(rawValue);
  const today = todayInTaipei();
  const items = questionsByStatus(bootstrap.questions, bootstrap.sessions, identity.participantId, value, {
    staleDays: bootstrap.settings.staleDays,
    today,
  });
  renderStatusFilterList(items);
  summary.textContent = `共 ${items.length} 題。`;
  if (shouldAnnounce) announce(`顯示 ${items.length} 題`);
}

// A1 修正：Windows 上在收合的 select 按方向鍵，每按一次就會觸發一次 change；
// 停止操作約 500ms 後才真正篩選與播報一次，焦點仍留在欄位。
statusFilter.addEventListener('change', debounce(() => applyStatusFilter(true), 500));

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
  weakContent.hidden = false;

  const today = todayInTaipei();
  const options = { staleDays: bootstrap.settings.staleDays, today };
  const weak = weakList(bootstrap.questions, bootstrap.sessions, identity.participantId, options);
  const unpracticed = unpracticedList(bootstrap.questions, bootstrap.sessions, identity.participantId);

  const anyNonDeepLink = bootstrap.questions.some(
    (q) => !massageExamLink(q, bootstrap.questionIntegrations).isDeepLink,
  );
  document.getElementById('exam-note').hidden = !anyNonDeepLink;

  renderPriority(weak);
  renderUnpracticed(unpracticed);
  applyStatusFilter(false);
}

init();
