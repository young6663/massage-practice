// 共用工具：試算表讀寫、snake_case ↔ camelCase 轉換、通行碼雜湊、時間格式、輸入驗證、公式注入防護。
// 對應 docs/PROJECT_SPEC.md §3（資料模型）、§6.1（Apps Script 端安全規則）。
// 這個檔案只放「純工具」，不放路由或每個 action 的商業邏輯（放在 Handlers.gs）。

var FAMILIARITY_VALUES_ = [1, 2, 3, 4];
var WEAKNESS_CODES_ = [
  'pathology', 'anatomy', 'symptoms', 'examination',
  'technique', 'sequence', 'acupoints', 'education', 'other',
];
var MAX_TEXT_LEN_ = 1000;
var MAX_NAME_LEN_ = 20;

// ---------- 錯誤慣例：與 assets/js/api/local.js 相同的 { ok:false, code, message } ----------

function fail_(code, message) {
  var err = new Error(message);
  err.ylpmError = true;
  err.code = code;
  err.message = message;
  throw err;
}

function requireString_(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail_('validation', '缺少必要欄位：' + fieldName);
  }
  return value;
}

function trimAndLimit_(value, fieldLabel) {
  var text = (value || '').toString().trim();
  if (text.length > MAX_TEXT_LEN_) {
    fail_('validation', '「' + fieldLabel + '」內容過長，請控制在 ' + MAX_TEXT_LEN_ + ' 字以內。');
  }
  return text;
}

// ---------- 時間 ----------

// 所有時間戳記存台北時間（PROJECT_SPEC §3：ISO 8601 含時區，台北固定 +08:00，無日光節約，不需要處理時區偏移变化）。
function nowIsoTaipei_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
}

function todayTaipei_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function isValidDateString_(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 防禦性轉換：欄位理論上是純文字（建立試算表時已設定成 @ 格式），但如果不小心被 Sheets 轉成 Date
// 物件（例如使用者手動在試算表打字覆蓋），讀出來時轉回文字，不要讓前端拿到 Date 物件序列化後的怪格式。
function toIsoString_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
  }
  return String(value);
}

function toDateString_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return String(value);
}

// ---------- 公式注入防護（PROJECT_SPEC §6.1） ----------
// 寫入文字欄位時，若開頭是 =、+、-、@，前面加一個單引號再存進試算表；
// 這樣即使試算表之後被匯出成 CSV 在 Excel 開啟，也不會被當成公式執行。
// 回傳給前端 JSON 時再把這個單引號拿掉，使用者在網頁上看到的還是原本輸入的文字。

function sanitizeCell_(text) {
  if (typeof text !== 'string') return text;
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function unsanitizeCell_(text) {
  if (typeof text !== 'string') return text;
  if (text.length > 1 && text.charAt(0) === "'" && /^[=+\-@]/.test(text.charAt(1))) {
    return text.slice(1);
  }
  return text;
}

// ---------- 通行碼（PROJECT_SPEC §6.1） ----------

function sha256Hex_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      var h = v.toString(16);
      return h.length === 1 ? '0' + h : h;
    })
    .join('');
}

function verifyAccessCode_(groupId, accessCode) {
  if (!accessCode || typeof accessCode !== 'string') return false;
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('ACCESS_SALT_' + groupId);
  var hash = props.getProperty('ACCESS_HASH_' + groupId);
  if (!salt || !hash) return false; // 尚未執行 setAccessCode()
  return sha256Hex_(salt + accessCode) === hash;
}

// ---------- 暴力猜測防護（PROJECT_SPEC §6.1：10 分鐘內失敗 30 次 → 鎖定 10 分鐘） ----------

function isThrottleLocked_() {
  return CacheService.getScriptCache().get('ylpm_locked') === '1';
}

function recordAuthFailure_() {
  var cache = CacheService.getScriptCache();
  var current = Number(cache.get('ylpm_fail_count') || '0') + 1;
  cache.put('ylpm_fail_count', String(current), 600);
  if (current >= 30) {
    cache.put('ylpm_locked', '1', 600);
  }
}

// ---------- 工作表讀寫 ----------

// 讀整張工作表：回傳 { sheet, headers, rows }；rows 是用第一列表頭當 key 的物件陣列（snake_case），
// 每個 row 物件多一個 __rowIndex（該列在試算表上真正的列號，從 1 開始，表頭是第 1 列），
// 用來後續 updateRowByIndex_ 精準寫回同一列，不必重新搜尋。
function getSheetData_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    fail_('setup_missing', '找不到工作表：' + sheetName + '，請先在 Apps Script 編輯器執行 setupSheets。');
  }
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var rowArr = values[r];
    var hasContent = rowArr.some(function (cell) {
      return cell !== '' && cell !== null && cell !== undefined;
    });
    if (!hasContent) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowArr[c];
    }
    obj.__rowIndex = r + 1; // values 是 0-based，第 0 列是表頭，所以第 r 列在試算表上是 r+1 列
    rows.push(obj);
  }
  return { sheet: sheet, headers: headers, rows: rows };
}

function appendRow_(sheetName, rowObj) {
  var data = getSheetData_(sheetName);
  var row = data.headers.map(function (h) {
    var v = rowObj[h];
    return v === undefined || v === null ? '' : v;
  });
  data.sheet.appendRow(row);
}

// 更新 getSheetData_ 回傳的 rows[rowArrayIndex] 這一列，只改 patchObj 有給的欄位。
function updateRowByIndex_(sheetData, rowArrayIndex, patchObj) {
  var row = sheetData.rows[rowArrayIndex];
  var sheetRowNumber = row.__rowIndex;
  for (var c = 0; c < sheetData.headers.length; c++) {
    var h = sheetData.headers[c];
    if (Object.prototype.hasOwnProperty.call(patchObj, h)) {
      sheetData.sheet.getRange(sheetRowNumber, c + 1).setValue(patchObj[h]);
      row[h] = patchObj[h];
    }
  }
}

// ---------- 群組（MVP 假設一個試算表 = 一個群組，取 study_groups 的第一列） ----------

function getGroupRow_() {
  var data = getSheetData_('study_groups');
  if (data.rows.length === 0) {
    fail_('setup_missing', '找不到群組資料，請先在 Apps Script 編輯器執行 setupSheets。');
  }
  return data.rows[0];
}

// ---------- settings（key-value 列 → 單一物件，供 getBootstrap／updateSettings 使用） ----------

function buildSettingsObject_(rows) {
  var out = { selectionLimit: 2, currentDayId: 'd1', currentRound: 1, staleDays: 14 };
  rows.forEach(function (r) {
    var key = r.key;
    var raw = r.value;
    if (key === 'selectionLimit') {
      out.selectionLimit = String(raw) === 'unlimited' ? 'unlimited' : Number(raw);
    } else if (key === 'currentDayId') {
      out.currentDayId = String(raw);
    } else if (key === 'currentRound') {
      out.currentRound = Number(raw);
    } else if (key === 'staleDays') {
      out.staleDays = Number(raw);
    }
  });
  return out;
}

function upsertSetting_(groupId, key, value) {
  var data = getSheetData_('settings');
  var idx = -1;
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i].group_id === groupId && data.rows[i].key === key) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) {
    updateRowByIndex_(data, idx, { value: value });
  } else {
    appendRow_('settings', { group_id: groupId, key: key, value: value });
  }
}

// ---------- 列 → JSON 物件（camelCase，供 getBootstrap 與各 handler 回傳使用） ----------

function mapSelectionRow_(r) {
  return {
    id: r.selection_id,
    groupId: r.group_id,
    round: Number(r.round),
    dayId: r.day_id,
    participantId: r.participant_id,
    questionId: r.question_id,
    createdAt: toIsoString_(r.created_at),
    canceledAt: r.canceled_at ? toIsoString_(r.canceled_at) : null,
  };
}

function splitWeaknessCodes_(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s !== '';
    });
}

function mapSessionRow_(r) {
  return {
    id: r.session_id,
    groupId: r.group_id,
    participantId: r.participant_id,
    questionId: r.question_id,
    practicedAt: toDateString_(r.practiced_at),
    familiarity: Number(r.familiarity),
    weaknessCodes: splitWeaknessCodes_(r.weakness_codes),
    stuckPoint: unsanitizeCell_(r.stuck_point || ''),
    note: unsanitizeCell_(r.note || ''),
    source: r.source,
    selectionId: r.selection_id ? r.selection_id : null,
    createdAt: toIsoString_(r.created_at),
    voidedAt: r.voided_at ? toIsoString_(r.voided_at) : null,
  };
}

function activeSelectionsForDay_(groupId, dayId, round) {
  return getSheetData_('selections')
    .rows.filter(function (r) {
      return r.group_id === groupId && r.day_id === dayId && Number(r.round) === round && !r.canceled_at;
    })
    .map(mapSelectionRow_);
}

// ---------- 寫入操作的成員檢查（PROJECT_SPEC §6.1：participantId 必須是該群組的 active 成員，addParticipant 除外） ----------

function assertActiveMember_(groupId, participantId) {
  var members = getSheetData_('group_members').rows;
  var member = null;
  for (var i = 0; i < members.length; i++) {
    if (members[i].group_id === groupId && members[i].participant_id === participantId) {
      member = members[i];
      break;
    }
  }
  if (!member || member.status !== 'active') {
    fail_('forbidden', '找不到這位成員，或已經不是練習中的成員。');
  }
}
