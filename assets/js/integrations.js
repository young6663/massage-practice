// 外部系統網址的唯一出處；頁面不得直接寫外部網址。見 docs/INTEGRATIONS.md
import { el } from './ui/dom.js';

export const EXTERNAL_SYSTEMS = Object.freeze({
  massageExam: Object.freeze({
    name: '乙級術科練習',
    homeUrl: 'https://young6663.github.io/massage-exam/#main-content',
    // 術科網站自 v53（2026-09-25）起支援 #topic-{id}：直接選好該題並進入練習畫面（一位數題號也可）。
    deepLinkTemplate: 'https://young6663.github.io/massage-exam/#topic-{id}',
  }),
  acupointCoach: Object.freeze({
    name: '經穴背誦教練',
    homeUrl: 'https://young6663.github.io/acupoint/',
  }),
});

function findIntegration(questionIntegrations, questionId, system) {
  return (questionIntegrations || []).find(
    (row) => row.questionId === questionId && row.system === system,
  );
}

export function massageExamLink(question, questionIntegrations) {
  const sys = EXTERNAL_SYSTEMS.massageExam;
  const row = findIntegration(questionIntegrations, question.id, 'massageExam');
  if (row && row.url) return { href: row.url, isDeepLink: true };
  if (sys.deepLinkTemplate) {
    const externalId = (row && row.externalId) || String(question.number);
    return { href: sys.deepLinkTemplate.replace('{id}', encodeURIComponent(externalId)), isDeepLink: true };
  }
  return { href: sys.homeUrl, isDeepLink: false };
}

export function acupointCoachLink() {
  return { href: EXTERNAL_SYSTEMS.acupointCoach.homeUrl };
}

// 「開啟乙級術科練習」連結的顯示內容（含視覺隱藏文字），唯一出處，各頁共用，避免重複判斷 isDeepLink。
// 見 docs/INTEGRATIONS.md §4：未支援深層連結時只到首頁，連結文字不重複題號；支援後才加上「：第N題」。
export function massageExamLinkText(examLink, question) {
  if (examLink.isDeepLink) {
    return ['開啟乙級術科練習', el('span', { className: 'vh' }, `：第${question.number}題`)];
  }
  return ['開啟乙級術科練習首頁'];
}
