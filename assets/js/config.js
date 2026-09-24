// 環境設定：切換 local／appsScript 後端。頁面與 api 層都只從這裡讀設定。
export const config = Object.freeze({
  backend: 'local', // 'local' | 'appsScript'
  appsScriptUrl: '',
  localAccessCode: '1234',
  localLatencyMs: 300,
  groupId: 'g1',
});
