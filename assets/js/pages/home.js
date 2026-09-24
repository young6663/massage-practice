import { getBootstrap } from '../api/index.js';
import { el, showError, hideLoading } from '../ui/dom.js';
import { getIdentity } from '../ui/session.js';
import { renderWhoami } from '../ui/layout.js';
import { acupointCoachLink } from '../integrations.js';
import {
  todayInTaipei,
  remainingForDay,
  pendingSelections,
  weakList,
  questionStats,
  nextStep,
} from '../domain/progress.js';

const noIdentityNotice = document.getElementById('no-identity-notice');
const homeContent = document.getElementById('home-content');

function questionById(questions, id) {
  return questions.find((q) => q.id === id) || null;
}

function renderToday(bootstrap, currentDay, remaining) {
  const label = `${currentDay.label} ${currentDay.theme}`;
  document.getElementById('today-label').textContent = label;

  let sentence;
  if (remaining.limit === 'unlimited') {
    sentence = `不限選題數，你已選 ${remaining.selectedCount} 題。`;
  } else if (remaining.remaining > 0) {
    sentence = `建議選 ${remaining.limit} 題，你已選 ${remaining.selectedCount} 題，還差 ${remaining.remaining} 題。`;
  } else if (remaining.selectedCount > remaining.limit) {
    sentence = `你已選 ${remaining.selectedCount} 題，超過建議的 ${remaining.limit} 題。`;
  } else {
    sentence = `你已選 ${remaining.selectedCount} 題，已達建議數量。`;
  }
  document.getElementById('today-remaining').textContent = sentence;

  const dayLink = document.getElementById('today-day-link');
  dayLink.href = `day.html?d=${encodeURIComponent(currentDay.id)}`;
  document.getElementById('today-day-link-vh').textContent = `：${label}`;
}

function renderNextStep(step, questions) {
  document.getElementById('next-step-message').textContent = step.message;
  const wrap = document.getElementById('next-step-link-wrap');
  wrap.textContent = '';
  let link = null;
  if (step.type === 'selectMore') {
    link = el('a', { href: `day.html?d=${encodeURIComponent(step.dayId)}`, className: 'link-action' }, ['前往選題']);
  } else if (step.type === 'practice') {
    const q = questionById(questions, step.questionId);
    link = el('a', { href: `record.html?q=${encodeURIComponent(step.questionId)}&from=selection`, className: 'link-action' }, [
      '留下練習紀錄',
      el('span', { className: 'vh' }, q ? `：第${q.number}題 ${q.title}` : ''),
    ]);
  } else if (step.type === 'reviewWeak') {
    const q = questionById(questions, step.questionId);
    link = el('a', { href: `question.html?q=${encodeURIComponent(step.questionId)}`, className: 'link-action' }, [
      '查看紀錄',
      el('span', { className: 'vh' }, q ? `：第${q.number}題 ${q.title}` : ''),
    ]);
  } else if (step.type === 'draw') {
    link = el('a', { href: 'draw.html', className: 'link-action' }, ['前往模擬抽題']);
  }
  if (link) wrap.appendChild(link);
}

function renderMySelections(bootstrap, participantId, round, pending, today) {
  document.getElementById('my-selections-round').textContent = `目前第 ${round} 輪。`;
  const pendingIds = new Set(pending.map((p) => p.id));
  const container = document.getElementById('my-selections-days');
  container.textContent = '';
  const sortedDays = bootstrap.days.slice().sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    const mySelections = bootstrap.selections.filter(
      (s) => s.participantId === participantId && s.dayId === day.id && s.round === round && !s.canceledAt,
    );
    const heading = el('h3', {}, [`${day.label} ${day.theme}`]);
    container.appendChild(heading);
    if (mySelections.length === 0) {
      container.appendChild(el('p', {}, ['尚未選題。']));
      continue;
    }
    const ul = el('ul', { className: 'question-list' });
    for (const sel of mySelections) {
      const q = questionById(bootstrap.questions, sel.questionId);
      if (!q) continue;
      const stats = questionStats(bootstrap.sessions, participantId, q.id, { staleDays: bootstrap.settings.staleDays, today });
      const statusText = pendingIds.has(sel.id) ? '待練' : `已練 ${stats.count} 次`;
      const li = el('li', {}, [
        `第${q.number}題 ${q.title}－${statusText}　`,
        el('a', { href: `question.html?q=${encodeURIComponent(q.id)}`, className: 'link-action' }, [
          '查看紀錄',
          el('span', { className: 'vh' }, `：第${q.number}題 ${q.title}`),
        ]),
      ]);
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
}

function renderWeak(weak) {
  const container = document.getElementById('my-weak-list');
  container.textContent = '';
  if (weak.length === 0) {
    container.appendChild(el('p', {}, ['目前沒有弱題。']));
    return;
  }
  const ul = el('ul', { className: 'question-list' });
  for (const item of weak.slice(0, 3)) {
    const q = item.question;
    const li = el('li', {}, [
      el('p', {}, [`第${q.number}題 ${q.title}`]),
      el('p', { className: 'secondary' }, [item.reason]),
      el('a', { href: `question.html?q=${encodeURIComponent(q.id)}`, className: 'link-action' }, [
        '查看紀錄',
        el('span', { className: 'vh' }, `：第${q.number}題 ${q.title}`),
      ]),
    ]);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

function renderAllDays(days) {
  const list = document.getElementById('all-days-list');
  list.textContent = '';
  const sortedDays = days.slice().sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    const li = el('li', {}, [
      el('a', { href: `day.html?d=${encodeURIComponent(day.id)}`, className: 'link-action' }, [`${day.label} ${day.theme}`]),
    ]);
    list.appendChild(li);
  }
}

async function init() {
  const identity = getIdentity();
  if (!identity) {
    noIdentityNotice.hidden = false;
    hideLoading();
    return;
  }

  let bootstrap;
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

  const today = todayInTaipei();
  const round = bootstrap.settings.currentRound;
  const currentDay = bootstrap.days.find((d) => d.id === bootstrap.settings.currentDayId) || bootstrap.days[0];
  const remaining = remainingForDay(bootstrap.selections, identity.participantId, currentDay.id, round, bootstrap.settings.selectionLimit);
  const pending = pendingSelections(bootstrap.selections, bootstrap.sessions, identity.participantId, round);
  const weak = weakList(bootstrap.questions, bootstrap.sessions, identity.participantId, {
    staleDays: bootstrap.settings.staleDays,
    today,
  });
  const step = nextStep({ hasIdentity: true, remaining, currentDay, pending, weak, questions: bootstrap.questions });

  renderToday(bootstrap, currentDay, remaining);
  renderNextStep(step, bootstrap.questions);
  renderMySelections(bootstrap, identity.participantId, round, pending, today);
  renderWeak(weak);
  renderAllDays(bootstrap.days);
}

init();
