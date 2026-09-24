// 契約測試：對 local／appsScript 兩個 adapter 跑同一組 API 呼叫，確認回傳形狀與錯誤慣例一致
// （docs/PROJECT_SPEC.md §7）。用一個「測試同學-<時間戳記>」跑完整流程，最後標記退出做清理。
//
// 注意：對 appsScript backend 執行會在真正的 Google 試算表寫入真實資料列（見 tests/contract.html 的警語）。
import { config } from '../assets/js/config.js';
import * as local from '../assets/js/api/local.js';
import * as appsScript from '../assets/js/api/appsScript.js';
import { getIdentity, setIdentity, clearIdentity, setVerifiedAccessCode } from '../assets/js/ui/session.js';

function pickAdapter(backend) {
  return backend === 'appsScript' ? appsScript : local;
}

export async function runContractTests(backend, { accessCode } = {}) {
  const adapter = pickAdapter(backend);
  const results = [];
  let pass = 0;
  let fail = 0;
  let stopped = false;

  async function step(name, fn) {
    if (stopped) {
      results.push({ name, ok: null, error: '（因為前一步失敗，未執行）' });
      return;
    }
    try {
      await fn();
      pass += 1;
      results.push({ name, ok: true });
    } catch (e) {
      fail += 1;
      stopped = true;
      const msg = (e && e.message) || String(e);
      const code = e && e.code ? `[${e.code}] ` : '';
      results.push({ name, ok: false, error: code + msg });
    }
  }

  // 記住這台裝置原本的身份（含通行碼），appsScript 模式測試中途會暫時借用同一個 localStorage key，
  // 測試結束（不管成功失敗）都要還原，不能影響真正在用這台裝置的人。
  const previousIdentity = getIdentity();

  try {
    let bootstrap;
    await step('getBootstrap 回傳必要欄位', async () => {
      bootstrap = await adapter.getBootstrap();
      const requiredKeys = ['group', 'settings', 'participants', 'members', 'questions', 'days', 'questionIntegrations', 'selections', 'sessions'];
      for (const key of requiredKeys) {
        if (!(key in bootstrap)) throw new Error(`bootstrap 缺少欄位：${key}`);
      }
      if (!Array.isArray(bootstrap.days) || bootstrap.days.length === 0) throw new Error('沒有任何題組資料，無法繼續測試');
      if (!Array.isArray(bootstrap.days[0].questionIds) || bootstrap.days[0].questionIds.length === 0) {
        throw new Error('第一個題組沒有題目，無法繼續測試');
      }
    });

    const verifyCode = backend === 'appsScript' ? accessCode : config.localAccessCode;

    await step('verifyAccess：錯的通行碼要被拒絕', async () => {
      let threw = null;
      try {
        await adapter.verifyAccess('這一定是錯的通行碼-xyz-999');
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('錯的通行碼應該要失敗，卻成功了');
    });

    await step('verifyAccess：對的通行碼要成功', async () => {
      if (!verifyCode) throw new Error('appsScript 模式需要先輸入群組通行碼才能測試');
      const { group } = await adapter.verifyAccess(verifyCode);
      if (!group || !group.id) throw new Error('verifyAccess 沒有回傳 group');
      if (backend === 'appsScript') setVerifiedAccessCode(config.groupId, verifyCode);
    });

    const day = bootstrap && bootstrap.days ? bootstrap.days[0] : null;
    const questionId = day ? day.questionIds[0] : null;
    const testName = `測試同學-${Date.now()}`;
    let participantId;

    await step('addParticipant：建立測試用同學', async () => {
      const { participant, member } = await adapter.addParticipant({ displayName: testName });
      if (!participant || !participant.id) throw new Error('沒有回傳 participant');
      if (!member || member.status !== 'active') throw new Error('新成員應該是 active 狀態');
      participantId = participant.id;
    });

    let selectionId;
    await step('selectQuestion：選題', async () => {
      const { selection, daySelections } = await adapter.selectQuestion({ participantId, dayId: day.id, questionId });
      if (!selection || !selection.id) throw new Error('沒有回傳 selection');
      if (!daySelections.some((s) => s.id === selection.id)) throw new Error('daySelections 應該包含剛選的這一筆');
      selectionId = selection.id;
    });

    await step('selectQuestion：重複選同一題視為成功，回傳同一筆選題（不重複新增）', async () => {
      const { selection } = await adapter.selectQuestion({ participantId, dayId: day.id, questionId });
      if (selection.id !== selectionId) throw new Error('重複選題應該回傳同一筆 selection，卻回傳了不同的 id');
    });

    await step('cancelSelection：取消選題', async () => {
      const { daySelections } = await adapter.cancelSelection({ participantId, selectionId });
      if (daySelections.some((s) => s.id === selectionId)) throw new Error('取消後 daySelections 不應該還包含這一筆');
    });

    await step('createSession：familiarity=5 應該被拒絕（驗證錯誤，PROJECT_SPEC §6.1）', async () => {
      let threw = null;
      try {
        await adapter.createSession({
          participantId,
          questionId,
          practicedAt: '2020-01-01',
          familiarity: 5,
          weaknessCodes: [],
          stuckPoint: '',
          note: '',
          source: 'direct',
        });
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('familiarity=5 應該要被拒絕，卻成功了');
      if (threw.code !== 'validation') throw new Error(`錯誤代碼應該是 validation，實際是 ${threw.code}`);
    });

    let sessionId;
    await step('createSession：合法資料建立練習紀錄', async () => {
      const { session } = await adapter.createSession({
        participantId,
        questionId,
        practicedAt: '2020-01-01',
        familiarity: 2,
        weaknessCodes: ['technique'],
        stuckPoint: '契約測試建立，可以刪除',
        note: '契約測試建立，可以刪除',
        source: 'direct',
      });
      if (!session || !session.id) throw new Error('沒有回傳 session');
      if (session.familiarity !== 2) throw new Error('familiarity 應該是 2');
      sessionId = session.id;
    });

    await step('voidSession：作廢剛剛建立的紀錄', async () => {
      const { session } = await adapter.voidSession({ participantId, sessionId });
      if (!session.voidedAt) throw new Error('作廢後應該要有 voidedAt');
    });

    await step('voidSession：不能作廢別人的紀錄', async () => {
      // 用測試同學以外、bootstrap 裡任何一個既有成員當「別人」；沒有其他成員時這一步略過。
      const other = (bootstrap.members || []).find((m) => m.participantId !== participantId);
      if (!other) {
        results.push({ name: '（略過：沒有其他成員可以測試「不能作廢別人的紀錄」）', ok: true });
        pass += 1;
        return;
      }
      let threw = null;
      try {
        await adapter.voidSession({ participantId: other.participantId, sessionId });
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('應該要被拒絕，卻成功了');
    });

    await step('updateMemberStatus：把測試同學標記為已退出（清理）', async () => {
      const { member } = await adapter.updateMemberStatus({ participantId, status: 'left' });
      if (member.status !== 'left') throw new Error('狀態應該是 left');
    });
  } finally {
    if (backend === 'appsScript') {
      if (previousIdentity) setIdentity(previousIdentity);
      else clearIdentity();
    }
  }

  return { pass, fail, total: results.length, results };
}
