// 每個 API action 的商業邏輯。介面與回傳形狀對齊 docs/PROJECT_SPEC.md §7、assets/js/api/local.js，
// 前端不管是 local 還是 appsScript 後端都拿到一樣的資料形狀。
// 每個 handler 收到 (payload, groupRow)：payload 是這次請求的參數，groupRow 是 study_groups 那一列（已經通過通行碼驗證）。

// ---------- getBootstrap：一次回傳整個群組需要的資料 ----------

function handleGetBootstrap_(payload, groupRow) {
  var groupId = groupRow.group_id;

  var participants = getSheetData_('participants').rows.map(function (r) {
    return { id: r.participant_id, displayName: unsanitizeCell_(r.display_name), createdAt: toIsoString_(r.created_at) };
  });

  var members = getSheetData_('group_members')
    .rows.filter(function (r) {
      return r.group_id === groupId;
    })
    .map(function (r) {
      return { groupId: r.group_id, participantId: r.participant_id, role: r.role, status: r.status, joinedAt: toIsoString_(r.joined_at) };
    });

  var questions = getSheetData_('questions').rows.map(function (r) {
    return { id: r.question_id, number: Number(r.number), title: r.title };
  });

  var dqRows = getSheetData_('day_questions').rows;
  var days = getSheetData_('practice_days')
    .rows.filter(function (r) {
      return r.group_id === groupId;
    })
    .map(function (r) {
      var qIds = dqRows
        .filter(function (x) {
          return x.day_id === r.day_id;
        })
        .sort(function (a, b) {
          return Number(a.sort_order) - Number(b.sort_order);
        })
        .map(function (x) {
          return x.question_id;
        });
      return { id: r.day_id, groupId: r.group_id, order: Number(r.sort_order), label: r.label, theme: r.theme, questionIds: qIds };
    })
    .sort(function (a, b) {
      return a.order - b.order;
    });

  var questionIntegrations = getSheetData_('question_integrations').rows.map(function (r) {
    return { questionId: r.question_id, system: r.system, externalId: r.external_id, url: r.url || '' };
  });

  var settingsRows = getSheetData_('settings').rows.filter(function (r) {
    return r.group_id === groupId;
  });
  var settings = buildSettingsObject_(settingsRows);

  var selections = getSheetData_('selections')
    .rows.filter(function (r) {
      return r.group_id === groupId;
    })
    .map(mapSelectionRow_);

  var sessions = getSheetData_('practice_sessions')
    .rows.filter(function (r) {
      return r.group_id === groupId;
    })
    .map(mapSessionRow_);

  return {
    group: { id: groupRow.group_id, name: groupRow.name, status: groupRow.status },
    settings: settings,
    participants: participants,
    members: members,
    questions: questions,
    days: days,
    questionIntegrations: questionIntegrations,
    selections: selections,
    sessions: sessions,
  };
}

// ---------- verifyAccess：通行碼是否正確在 doPost 的共用檢查就做完了，這裡只回傳群組資訊 ----------

function handleVerifyAccess_(payload, groupRow) {
  return { group: { id: groupRow.group_id, name: groupRow.name, status: groupRow.status } };
}

// ---------- selectQuestion ----------

function handleSelectQuestion_(payload, groupRow) {
  var participantId = requireString_(payload.participantId, 'participantId');
  var dayId = requireString_(payload.dayId, 'dayId');
  var questionId = requireString_(payload.questionId, 'questionId');
  assertActiveMember_(groupRow.group_id, participantId);

  var settings = buildSettingsObject_(
    getSheetData_('settings').rows.filter(function (r) {
      return r.group_id === groupRow.group_id;
    })
  );
  var round = settings.currentRound;

  var data = getSheetData_('selections');
  var existing = null;
  for (var i = 0; i < data.rows.length; i++) {
    var r = data.rows[i];
    if (
      r.group_id === groupRow.group_id &&
      r.participant_id === participantId &&
      r.day_id === dayId &&
      r.question_id === questionId &&
      Number(r.round) === round &&
      !r.canceled_at
    ) {
      existing = r;
      break;
    }
  }

  var selection;
  if (existing) {
    // 同一人、同一輪、同一題組、同一題重複送出視為成功（PROJECT_SPEC §3.9），回傳既有那一筆。
    selection = mapSelectionRow_(existing);
  } else {
    var id = Utilities.getUuid();
    var createdAt = nowIsoTaipei_();
    appendRow_('selections', {
      selection_id: id,
      group_id: groupRow.group_id,
      round: round,
      day_id: dayId,
      participant_id: participantId,
      question_id: questionId,
      created_at: createdAt,
      canceled_at: '',
    });
    selection = { id: id, groupId: groupRow.group_id, round: round, dayId: dayId, participantId: participantId, questionId: questionId, createdAt: createdAt, canceledAt: null };
  }

  return { selection: selection, daySelections: activeSelectionsForDay_(groupRow.group_id, dayId, round) };
}

// ---------- cancelSelection ----------

function handleCancelSelection_(payload, groupRow) {
  var participantId = requireString_(payload.participantId, 'participantId');
  var selectionId = requireString_(payload.selectionId, 'selectionId');
  assertActiveMember_(groupRow.group_id, participantId);

  var data = getSheetData_('selections');
  var idx = -1;
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i].selection_id === selectionId) {
      idx = i;
      break;
    }
  }
  if (idx === -1) fail_('not_found', '找不到這筆選題。');
  var row = data.rows[idx];
  if (row.participant_id !== participantId) fail_('forbidden', '不能取消別人的選題。');

  if (!row.canceled_at) {
    var canceledAt = nowIsoTaipei_();
    updateRowByIndex_(data, idx, { canceled_at: canceledAt });
  }
  var updated = data.rows[idx];
  return { daySelections: activeSelectionsForDay_(groupRow.group_id, updated.day_id, Number(updated.round)) };
}

// ---------- createSession ----------

function handleCreateSession_(payload, groupRow) {
  var participantId = requireString_(payload.participantId, 'participantId');
  var questionId = requireString_(payload.questionId, 'questionId');
  assertActiveMember_(groupRow.group_id, participantId);

  var familiarity = Number(payload.familiarity);
  if (FAMILIARITY_VALUES_.indexOf(familiarity) === -1) fail_('validation', '請選擇熟悉程度。');

  var practicedAt = payload.practicedAt;
  if (!practicedAt || !isValidDateString_(practicedAt)) fail_('validation', '請填寫正確格式的練習日期（YYYY-MM-DD）。');
  if (practicedAt > todayTaipei_()) fail_('validation', '練習日期不能晚於今天。');

  var weaknessCodesInput = Array.isArray(payload.weaknessCodes) ? payload.weaknessCodes : [];
  for (var i = 0; i < weaknessCodesInput.length; i++) {
    if (WEAKNESS_CODES_.indexOf(weaknessCodesInput[i]) === -1) fail_('validation', '弱點分類不正確。');
  }

  var stuckPoint = trimAndLimit_(payload.stuckPoint, '卡在哪裡');
  var note = trimAndLimit_(payload.note, '備註');

  var allowedSources = ['selection', 'draw', 'direct'];
  var source = allowedSources.indexOf(payload.source) !== -1 ? payload.source : 'direct';
  var selectionId = payload.selectionId || null;

  var id = Utilities.getUuid();
  var createdAt = nowIsoTaipei_();
  appendRow_('practice_sessions', {
    session_id: id,
    group_id: groupRow.group_id,
    participant_id: participantId,
    question_id: questionId,
    practiced_at: practicedAt,
    familiarity: familiarity,
    weakness_codes: weaknessCodesInput.join(','),
    stuck_point: sanitizeCell_(stuckPoint),
    note: sanitizeCell_(note),
    source: source,
    selection_id: selectionId || '',
    created_at: createdAt,
    voided_at: '',
  });

  return {
    session: {
      id: id,
      groupId: groupRow.group_id,
      participantId: participantId,
      questionId: questionId,
      practicedAt: practicedAt,
      familiarity: familiarity,
      weaknessCodes: weaknessCodesInput,
      stuckPoint: stuckPoint,
      note: note,
      source: source,
      selectionId: selectionId,
      createdAt: createdAt,
      voidedAt: null,
    },
  };
}

// ---------- voidSession ----------

function handleVoidSession_(payload, groupRow) {
  var participantId = requireString_(payload.participantId, 'participantId');
  var sessionId = requireString_(payload.sessionId, 'sessionId');
  assertActiveMember_(groupRow.group_id, participantId);

  var data = getSheetData_('practice_sessions');
  var idx = -1;
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i].session_id === sessionId) {
      idx = i;
      break;
    }
  }
  if (idx === -1) fail_('not_found', '找不到這筆練習紀錄。');
  var row = data.rows[idx];
  if (row.participant_id !== participantId) fail_('forbidden', '不能作廢別人的紀錄。');

  if (!row.voided_at) {
    updateRowByIndex_(data, idx, { voided_at: nowIsoTaipei_() });
  }
  return { session: mapSessionRow_(data.rows[idx]) };
}

// ---------- addParticipant（新同學加入，不檢查 active 成員，因為這個人本來就還不是成員） ----------

function handleAddParticipant_(payload, groupRow) {
  var name = (payload.displayName || '').toString().trim();
  if (!name) fail_('validation', '請輸入顯示名稱。');
  if (name.length > MAX_NAME_LEN_) fail_('validation', '顯示名稱最多 ' + MAX_NAME_LEN_ + ' 個字。');

  var id = Utilities.getUuid();
  var createdAt = nowIsoTaipei_();
  appendRow_('participants', { participant_id: id, display_name: sanitizeCell_(name), created_at: createdAt });
  appendRow_('group_members', { group_id: groupRow.group_id, participant_id: id, role: 'member', status: 'active', joined_at: createdAt });

  return {
    participant: { id: id, displayName: name, createdAt: createdAt },
    member: { groupId: groupRow.group_id, participantId: id, role: 'member', status: 'active', joinedAt: createdAt },
  };
}

// ---------- updateMemberStatus ----------

function handleUpdateMemberStatus_(payload, groupRow) {
  var participantId = requireString_(payload.participantId, 'participantId');
  var status = payload.status;
  if (['active', 'paused', 'left'].indexOf(status) === -1) fail_('validation', '狀態不正確。');

  var data = getSheetData_('group_members');
  var idx = -1;
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i].group_id === groupRow.group_id && data.rows[i].participant_id === participantId) {
      idx = i;
      break;
    }
  }
  if (idx === -1) fail_('not_found', '找不到這位成員。');
  updateRowByIndex_(data, idx, { status: status });
  var row = data.rows[idx];
  return { member: { groupId: row.group_id, participantId: row.participant_id, role: row.role, status: row.status, joinedAt: toIsoString_(row.joined_at) } };
}

// ---------- updateSettings（沒有 participantId，所以不做 active 成員檢查，見 DEPLOY.md／PROGRESS 的已知限制） ----------

function handleUpdateSettings_(payload, groupRow) {
  var groupId = groupRow.group_id;

  if (payload.currentDayId !== undefined) {
    var days = getSheetData_('practice_days').rows.filter(function (r) {
      return r.group_id === groupId;
    });
    var found = days.some(function (d) {
      return d.day_id === payload.currentDayId;
    });
    if (!found) fail_('validation', '找不到這個題組。');
    upsertSetting_(groupId, 'currentDayId', payload.currentDayId);
  }

  if (payload.selectionLimit !== undefined) {
    var v = payload.selectionLimit;
    var isUnlimited = v === 'unlimited';
    var isNonNegInt = Number.isInteger(Number(v)) && Number(v) >= 0;
    if (!isUnlimited && !isNonNegInt) fail_('validation', '建議選題數不正確。');
    upsertSetting_(groupId, 'selectionLimit', v);
  }

  if (payload.currentRound !== undefined) {
    var round = Number(payload.currentRound);
    if (!Number.isInteger(round) || round < 1) fail_('validation', '輪次不正確。');
    upsertSetting_(groupId, 'currentRound', round);
  }

  var rows = getSheetData_('settings').rows.filter(function (r) {
    return r.group_id === groupId;
  });
  return { settings: buildSettingsObject_(rows) };
}
