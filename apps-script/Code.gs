// 入口：doGet／doPost。路由到 Handlers.gs 的各個 handler，共用的通行碼驗證、暴力猜測防護、
// LockService 寫入序列化都在這裡做一次，避免每個 handler 各自重複。
// 對應 docs/PROJECT_SPEC.md §7（API 契約）、§6.1（Apps Script 端安全規則）。
//
// body 為 JSON：{ action, accessCode, payload }。
// 回傳一律 ContentService JSON：{ ok:true, data } 或 { ok:false, code, message }（message 為可直接顯示的繁體中文），
// 與 assets/js/api/local.js 的錯誤慣例相同，讓兩個 adapter 對前端而言行為一致。

// write:true 的 action 會包在 LockService 裡序列化，避免同時寫入互相覆蓋（PROJECT_SPEC §7）。
var HANDLERS_ = {
  getBootstrap: { fn: handleGetBootstrap_, write: false },
  verifyAccess: { fn: handleVerifyAccess_, write: false },
  selectQuestion: { fn: handleSelectQuestion_, write: true },
  cancelSelection: { fn: handleCancelSelection_, write: true },
  createSession: { fn: handleCreateSession_, write: true },
  voidSession: { fn: handleVoidSession_, write: true },
  addParticipant: { fn: handleAddParticipant_, write: true },
  updateMemberStatus: { fn: handleUpdateMemberStatus_, write: true },
  updateSettings: { fn: handleUpdateSettings_, write: true },
};

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 健康檢查用；不回傳任何資料，避免不小心把資料透過網址列露出去。
function doGet(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, code: 'bad_request', message: '請求格式不正確。' });
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonOutput_({ ok: false, code: 'bad_request', message: '請求格式不正確。' });
    }

    var action = body.action;
    var accessCode = body.accessCode;
    var payload = body.payload || {};

    // 暴力猜測防護（PROJECT_SPEC §6.1）：鎖定期間內，不管通行碼對不對都一律拒絕。
    if (isThrottleLocked_()) {
      return jsonOutput_({ ok: false, code: 'rate_limited', message: '嘗試次數過多，請 10 分鐘後再試。' });
    }

    var groupRow = getGroupRow_();
    var authOk = verifyAccessCode_(groupRow.group_id, accessCode);
    if (!authOk) {
      recordAuthFailure_();
      if (action === 'verifyAccess') {
        return jsonOutput_({ ok: false, code: 'invalid_access_code', message: '通行碼不正確，請再確認一次。' });
      }
      // 不是 verifyAccess 本身失敗，代表這台裝置存的通行碼已經失效（例如通行碼被重設）；
      // 前端 appsScript.js 會依照這個 code 清掉裝置上存的身份，請使用者回 who.html 重新輸入。
      return jsonOutput_({ ok: false, code: 'ACCESS_DENIED', message: '通行碼已失效，請重新輸入通行碼。' });
    }

    var entry = HANDLERS_[action];
    if (!entry) {
      return jsonOutput_({ ok: false, code: 'unknown_action', message: '不支援的操作。' });
    }

    var data;
    if (entry.write) {
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
      } catch (lockErr) {
        return jsonOutput_({ ok: false, code: 'busy', message: '系統忙碌中，請稍後再試一次。' });
      }
      try {
        data = entry.fn(payload, groupRow);
      } finally {
        lock.releaseLock();
      }
    } else {
      data = entry.fn(payload, groupRow);
    }

    return jsonOutput_({ ok: true, data: data });
  } catch (err) {
    if (err && err.ylpmError) {
      return jsonOutput_({ ok: false, code: err.code, message: err.message });
    }
    console.error(err && err.stack ? err.stack : err); // 只寫入 Apps Script 執行紀錄，不回傳給前端
    return jsonOutput_({ ok: false, code: 'server_error', message: '伺服器發生錯誤，請稍後再試一次。' });
  }
}
