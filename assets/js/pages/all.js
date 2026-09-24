import { getBootstrap } from '../api/index.js';
import { el, announce, showError, hideLoading, debounce } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { filterAllQuestions, formatDateDisplay, todayInTaipei } from '../domain/progress.js';
import { familiarityLabel, familiarityCssClass } from '../constants.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const allContent = document.getElementById('all-content');
const statusSelect = document.getElementById('filter-status');
const daySelect = document.getElementById('filter-day');
const numberInput = document.getElementById('filter-number');
const tableBody = document.getElementById('table-body');
const caption = document.getElementById('table-caption');

// S7 修正：weak.html「尚未練過」改成連結過來這裡並帶 status 參數，直接預選篩選條件。
const initialStatusParam = new URLSearchParams(window.location.search).get('status');

const STATUS_LABEL = { all: '全部狀態', unpracticed: '尚未練過', 1: '很不熟', 2: '還要再練', 3: '大致可以', 4: '可以上場' };

let bootstrap = null;
let identity = null;

function qLabel(q) {
  return `第${q.number}題 ${q.title}`;
}

function parseStatusValue(value) {
  if (value === 'all' || value === 'unpracticed') return value;
  return Number(value);
}

function populateDaySelect() {
  const sortedDays = bootstrap.days.slice().sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    daySelect.appendChild(el('option', { value: day.id }, [`${day.label} ${day.theme}`]));
  }
}

function dayLabelText(dayId) {
  if (dayId === 'all') return '全部題組';
  const day = bootstrap.days.find((d) => d.id === dayId);
  return day ? `${day.label} ${day.theme}` : '全部題組';
}

function currentFilters() {
  // S6 修正：題號欄改成 type="text"（避免 type="number" 的微調按鈕與過小字級），
  // 讀取時只取數字字元，貼上或打錯字時不會整個篩選壞掉。
  const numberValue = numberInput.value.replace(/\D/g, '');
  return {
    status: parseStatusValue(statusSelect.value),
    dayId: daySelect.value,
    number: numberValue ? Number(numberValue) : null,
  };
}

function buildRow(item) {
  const { question: q, day, stats } = item;
  const famText = stats.count > 0 ? familiarityLabel(stats.latest.familiarity) : '尚未練過';
  const famClass = stats.count > 0 ? familiarityCssClass(stats.latest.familiarity) : 'fam-none';
  const lastPracticed = stats.count > 0 ? formatDateDisplay(stats.latestDate, todayInTaipei()) : '尚未練過';

  return el('tr', {}, [
    el('th', { scope: 'row' }, [el('a', { href: `question.html?q=${encodeURIComponent(q.id)}` }, [qLabel(q)])]),
    el('td', {}, [day ? `${day.label} ${day.theme}` : '（無題組）']),
    el('td', {}, [`${stats.count} 次`]),
    el('td', {}, [el('span', { className: `badge ${famClass}` }, [famText])]),
    el('td', {}, [lastPracticed]),
  ]);
}

function renderTable(shouldAnnounce) {
  const filters = currentFilters();
  const today = todayInTaipei();
  const items = filterAllQuestions(bootstrap.questions, bootstrap.days, bootstrap.sessions, identity.participantId, filters, {
    staleDays: bootstrap.settings.staleDays,
    today,
  });

  tableBody.textContent = '';
  if (items.length === 0) {
    tableBody.appendChild(
      el('tr', {}, [el('td', { colspan: '5' }, ['沒有符合篩選條件的題目。'])]),
    );
  } else {
    for (const item of items) {
      tableBody.appendChild(buildRow(item));
    }
  }

  const numberText = filters.number ? `、第${filters.number}題` : '';
  caption.textContent = `${dayLabelText(filters.dayId)}、${STATUS_LABEL[filters.status]}${numberText}，共 ${items.length} 題`;

  if (shouldAnnounce) announce(`顯示 ${items.length} 題`);
}

// A1／S6 修正：停止操作約 500ms 後才篩選並播報一次，避免方向鍵瀏覽 select 選項、
// 或題號欄每打一個字就重繪表格、播報「顯示 N 題」。
const debouncedRenderTable = debounce(() => renderTable(true), 500);
statusSelect.addEventListener('change', debouncedRenderTable);
daySelect.addEventListener('change', debouncedRenderTable);
numberInput.addEventListener('input', debouncedRenderTable);

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
  allContent.hidden = false;

  populateDaySelect();
  if (initialStatusParam && Array.from(statusSelect.options).some((o) => o.value === initialStatusParam)) {
    statusSelect.value = initialStatusParam;
  }
  renderTable(false);
}

init();
