// 資料存取層入口：頁面只從這裡呼叫，不直接碰 localStorage 或 fetch 後端。
// 依 config.backend 選擇 adapter；介面對應 docs/PROJECT_SPEC.md §7。
import { config } from '../config.js';
import * as local from './local.js';
import * as appsScript from './appsScript.js';

function pickAdapter() {
  if (config.backend === 'appsScript') {
    return appsScript;
  }
  return local;
}

const adapter = pickAdapter();

export const getBootstrap = (...args) => adapter.getBootstrap(...args);
export const verifyAccess = (...args) => adapter.verifyAccess(...args);
export const selectQuestion = (...args) => adapter.selectQuestion(...args);
export const cancelSelection = (...args) => adapter.cancelSelection(...args);
export const createSession = (...args) => adapter.createSession(...args);
export const voidSession = (...args) => adapter.voidSession(...args);
export const addParticipant = (...args) => adapter.addParticipant(...args);
export const updateMemberStatus = (...args) => adapter.updateMemberStatus(...args);
export const updateSettings = (...args) => adapter.updateSettings(...args);
