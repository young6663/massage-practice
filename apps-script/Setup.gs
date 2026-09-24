// 上線前要在 Apps Script 編輯器手動執行的函式：setupSheets()、setAccessCode()、選擇性的 importMembers()。
// 詳細步驟見 apps-script/DEPLOY.md。這裡也提供一個試算表選單（開啟試算表時自動出現），
// 方便直接點選單執行，不用在 Apps Script 編輯器的函式下拉選單裡找函式名稱。

var SHEET_DEFS_ = [
  { name: 'participants', headers: ['participant_id', 'display_name', 'created_at'] },
  { name: 'study_groups', headers: ['group_id', 'name', 'status', 'created_at'] },
  { name: 'group_members', headers: ['group_id', 'participant_id', 'role', 'status', 'joined_at'] },
  { name: 'questions', headers: ['question_id', 'number', 'title'] },
  { name: 'practice_days', headers: ['day_id', 'group_id', 'sort_order', 'label', 'theme', 'date'] },
  { name: 'day_questions', headers: ['day_id', 'question_id', 'sort_order'] },
  { name: 'question_integrations', headers: ['question_id', 'system', 'external_id', 'url'] },
  { name: 'settings', headers: ['group_id', 'key', 'value'] },
  {
    name: 'selections',
    headers: ['selection_id', 'group_id', 'round', 'day_id', 'participant_id', 'question_id', 'created_at', 'canceled_at'],
  },
  {
    name: 'practice_sessions',
    headers: [
      'session_id', 'group_id', 'participant_id', 'question_id', 'practiced_at', 'familiarity',
      'weakness_codes', 'stuck_point', 'note', 'source', 'selection_id', 'created_at', 'voided_at',
    ],
  },
];

// 這幾欄一律用純文字格式，避免 Google 試算表自動把它們轉成日期／數字，改變原本的字串內容
// （PROJECT_SPEC §3：practiced_at 要存 'YYYY-MM-DD' 純文字；時間戳記也一起用純文字比較保險）。
// 使用者輸入的文字欄位也設純文字，讓 = 開頭的內容永遠不會被當成公式（sanitizeCell_ 為第二道防護）
var PLAIN_TEXT_COLUMNS_ = ['created_at', 'joined_at', 'practiced_at', 'canceled_at', 'voided_at', 'display_name', 'stuck_point', 'note', 'weakness_codes', 'date'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('乙級上岸練習系統')
    .addItem('1. 建立所有工作表（setupSheets）', 'setupSheets')
    .addItem('2. 設定群組通行碼（setAccessCode）', 'setAccessCode')
    .addItem('3.（選用）匯入初始成員（importMembers）', 'importMembers')
    .addToUi();
}

function ensureSheetWithHeaders_(ss, def) {
  var sheet = ss.getSheetByName(def.name);
  if (!sheet) sheet = ss.insertSheet(def.name);

  var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
  headerRange.setValues([def.headers]);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  var totalRows = Math.max(sheet.getMaxRows(), 1000);
  def.headers.forEach(function (h, i) {
    if (PLAIN_TEXT_COLUMNS_.indexOf(h) !== -1) {
      sheet.getRange(1, i + 1, totalRows, 1).setNumberFormat('@');
    }
  });
}

function seedIfEmpty_(sheetName, rows) {
  var data = getSheetData_(sheetName);
  if (data.rows.length > 0) return; // 已經有資料就不重複塞種子資料，setupSheets 可以放心重複執行
  rows.forEach(function (r) {
    appendRow_(sheetName, r);
  });
}

// 建立全部工作表＋表頭＋純文字格式，並塞入題目／題組／設定等種子資料（不含真實成員）。
// 可以放心重複執行：工作表已存在就不重建，已有資料的工作表也不會被種子資料覆蓋或重複塞入。
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_DEFS_.forEach(function (def) {
    ensureSheetWithHeaders_(ss, def);
  });

  seedIfEmpty_(
    'questions',
    SEED_DATA_.questions.map(function (q) {
      return { question_id: q.id, number: q.number, title: q.title };
    })
  );

  seedIfEmpty_(
    'study_groups',
    SEED_DATA_.groups.map(function (g) {
      return { group_id: g.id, name: g.name, status: 'active', created_at: nowIsoTaipei_() };
    })
  );

  seedIfEmpty_(
    'practice_days',
    SEED_DATA_.practiceDays.map(function (d) {
      return { day_id: d.id, group_id: d.groupId, sort_order: d.order, label: d.label, theme: d.theme, date: d.date || '' };
    })
  );

  var dayQuestionRows = [];
  SEED_DATA_.practiceDays.forEach(function (d) {
    d.questionIds.forEach(function (qid, i) {
      dayQuestionRows.push({ day_id: d.id, question_id: qid, sort_order: i + 1 });
    });
  });
  seedIfEmpty_('day_questions', dayQuestionRows);

  seedIfEmpty_(
    'question_integrations',
    (SEED_DATA_.questionIntegrations || []).map(function (qi) {
      return { question_id: qi.questionId, system: qi.system, external_id: qi.externalId, url: qi.url || '' };
    })
  );

  var settingsRows = [];
  Object.keys(SEED_DATA_.settings).forEach(function (groupId) {
    var s = SEED_DATA_.settings[groupId];
    Object.keys(s).forEach(function (key) {
      settingsRows.push({ group_id: groupId, key: key, value: s[key] });
    });
  });
  seedIfEmpty_('settings', settingsRows);

  SpreadsheetApp.getUi().alert(
    '工作表建立完成。\n\n接下來請執行「設定群組通行碼」（setAccessCode）。\n' +
      '成員名單目前是空的，之後可以用「匯入初始成員」（importMembers），或直接在 group.html 網頁上新增同學。'
  );
}

// 設定群組通行碼：跳出對話框輸入，雜湊後存進「指令碼屬性」，不會出現在程式碼、Log 或試算表裡（PROJECT_SPEC §6.1）。
function setAccessCode() {
  var ui = SpreadsheetApp.getUi();
  var groupRow;
  try {
    groupRow = getGroupRow_();
  } catch (e) {
    ui.alert('請先執行「建立所有工作表」（setupSheets），再回來設定通行碼。');
    return;
  }

  var result = ui.prompt(
    '設定群組通行碼',
    '請輸入至少 6 個字的群組通行碼（同學會用這組通行碼登入練習系統，請直接口頭告知，不要寫在聊天訊息或程式碼裡）：',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;

  var code = (result.getResponseText() || '').trim();
  if (code.length < 6) {
    ui.alert('通行碼至少要 6 個字，請重新從選單執行「設定群組通行碼」。');
    return;
  }

  var salt = Utilities.getUuid();
  var hash = sha256Hex_(salt + code);
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ACCESS_SALT_' + groupRow.group_id, salt);
  props.setProperty('ACCESS_HASH_' + groupRow.group_id, hash);

  ui.alert('通行碼已設定完成。請直接口頭告知同學，不會顯示在畫面、Log 或試算表的任何地方。');
}

// 選用：把 private/seed.members.json 的內容貼進對話框，匯入初始成員／群組關係／選題／練習紀錄。
// 只新增 id 還不存在的資料，可以放心重複執行（例如貼錯重貼一次）。真實姓名只會出現在這個對話框
// 跟試算表裡，不會寫進任何程式碼檔案（CLAUDE.md：真實成員資料只放 private/ 與 Google 試算表）。
function importMembers() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    '匯入初始成員',
    '請貼上 private/seed.members.json 的完整內容：',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;

  var raw = result.getResponseText();
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    ui.alert('JSON 格式錯誤，請確認貼上的內容完整（從第一個 { 到最後一個 }），再重新執行「匯入初始成員」。');
    return;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var added = { participants: 0, groupMembers: 0, selections: 0, practiceSessions: 0 };

    var existingParticipantIds = getSheetData_('participants').rows.map(function (r) {
      return String(r.participant_id);
    });
    (data.participants || []).forEach(function (p) {
      if (existingParticipantIds.indexOf(String(p.id)) === -1) {
        appendRow_('participants', {
          participant_id: p.id,
          display_name: sanitizeCell_(p.displayName || ''),
          created_at: p.createdAt || nowIsoTaipei_(),
        });
        added.participants++;
      }
    });

    var existingMemberKeys = getSheetData_('group_members').rows.map(function (r) {
      return r.group_id + '|' + r.participant_id;
    });
    (data.groupMembers || []).forEach(function (m) {
      var key = m.groupId + '|' + m.participantId;
      if (existingMemberKeys.indexOf(key) === -1) {
        appendRow_('group_members', {
          group_id: m.groupId,
          participant_id: m.participantId,
          role: m.role || 'member',
          status: m.status || 'active',
          joined_at: m.joinedAt || nowIsoTaipei_(),
        });
        added.groupMembers++;
      }
    });

    var existingSelectionIds = getSheetData_('selections').rows.map(function (r) {
      return String(r.selection_id);
    });
    (data.selections || []).forEach(function (s) {
      if (existingSelectionIds.indexOf(String(s.id)) === -1) {
        appendRow_('selections', {
          selection_id: s.id,
          group_id: s.groupId,
          round: s.round,
          day_id: s.dayId,
          participant_id: s.participantId,
          question_id: s.questionId,
          created_at: s.createdAt || nowIsoTaipei_(),
          canceled_at: s.canceledAt || '',
        });
        added.selections++;
      }
    });

    var existingSessionIds = getSheetData_('practice_sessions').rows.map(function (r) {
      return String(r.session_id);
    });
    (data.practiceSessions || []).forEach(function (ps) {
      if (existingSessionIds.indexOf(String(ps.id)) === -1) {
        appendRow_('practice_sessions', {
          session_id: ps.id,
          group_id: ps.groupId,
          participant_id: ps.participantId,
          question_id: ps.questionId,
          practiced_at: ps.practicedAt,
          familiarity: ps.familiarity,
          weakness_codes: (ps.weaknessCodes || []).join(','),
          stuck_point: sanitizeCell_(ps.stuckPoint || ''),
          note: sanitizeCell_(ps.note || ''),
          source: ps.source || 'direct',
          selection_id: ps.selectionId || '',
          created_at: ps.createdAt || nowIsoTaipei_(),
          voided_at: ps.voidedAt || '',
        });
        added.practiceSessions++;
      }
    });

    ui.alert(
      '匯入完成：新增 ' + added.participants + ' 位成員、' + added.groupMembers + ' 筆群組關係、' +
        added.selections + ' 筆選題、' + added.practiceSessions + ' 筆練習紀錄。\n已存在的 id 會自動略過，不會重複新增。'
    );
  } finally {
    lock.releaseLock();
  }
}
