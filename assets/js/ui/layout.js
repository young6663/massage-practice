// 共用頁首行為：更新「目前身份」文字。頁首與導覽本身是各頁的靜態 HTML，這裡只補文字內容。
import { getIdentity } from './session.js';

export function renderWhoami(participants) {
  const nameEl = document.getElementById('whoami-name');
  if (!nameEl) return;
  const identity = getIdentity();
  if (!identity) {
    nameEl.textContent = '尚未選擇';
    return;
  }
  const participant = (participants || []).find((p) => p.id === identity.participantId);
  nameEl.textContent = participant ? participant.displayName : '尚未選擇';
}

export function activeMembers(members, participants) {
  const byId = new Map((participants || []).map((p) => [p.id, p]));
  return (members || [])
    .filter((m) => m.status === 'active')
    .map((m) => byId.get(m.participantId))
    .filter(Boolean);
}
