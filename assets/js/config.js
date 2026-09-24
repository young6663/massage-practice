// 環境設定：切換 local／appsScript 後端。頁面與 api 層都只從這裡讀設定。
// 版本號與日期：每次修改網站都要更新，畫面最下方會顯示。
export const APP_VERSION = '1.0.0';
export const APP_VERSION_DATE = '2026-09-24';

export const config = Object.freeze({
  backend: 'appsScript', // 'local' | 'appsScript'
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxvVl4TxojLDPDbGsKQ6ywqk_JJ2lYRHqoXUTHNEZ7tq3LNO5DkWAzyejugnAbJn0tx/exec',
  localAccessCode: '1234',
  localLatencyMs: 300,
  groupId: 'g1',
});
