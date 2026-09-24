# 模型資源分配

原則：**用能完成任務的最低成本模型。** Haiku 做得到不升 Sonnet；Sonnet 做得到不升 Opus。

| Agent | 模型 | 負責 | 不負責 |
|---|---|---|---|
| product-architect | Opus | 架構、資料模型、重大決策、整合設計、跨模組 root cause、里程碑審查 | CRUD、CSS、種子資料、簡單 bug |
| accessibility-reviewer | Opus | NVDA／VoiceOver／TalkBack、鍵盤、低視能、對比、縮放、焦點、語意 HTML、ARIA 審查 | 一般實作（交給 builder） |
| fullstack-builder | Sonnet | 前端、Apps Script、資料層、UI、RWD、一般無障礙實作、一般 bug | 改資料模型或架構（要先找 architect） |
| qa-tester | Sonnet | 單元、整合、E2E、回歸、鍵盤與無障礙流程測試 | 修功能（回報給 builder） |
| content-worker | Haiku | 題目中繼資料、種子、測試資料、固定文字、格式整理 | 任何程式邏輯 |

## 升級到 Opus 的條件（只有這些）

- 架構矛盾、跨模組問題
- 重大資料模型修改、資料一致性問題
- 安全性
- 核心無障礙架構（焦點策略、狀態播報策略）
- 整合架構
- Sonnet 對同一個 root cause 修了兩次仍失敗
- 里程碑審查（每個 Phase 結束）

## 實際執行方式（Claude Code Desktop）

- `.claude/agents/*.md` 的 `model` 欄位指定各 agent 模型；在專案資料夾開新 session 後即可用 agent 名稱呼叫。
- 同一個 session 內也可以在呼叫子代理時指定 `model`（sonnet／haiku），不必切換主模型。
- 若某次無法指定模型：**不假裝已使用指定模型**，改為停下來明確告知「現在請切換到 Sonnet 5 High」或「現在需要切回 Opus 5.5 High 做 Review」，並說明原因。
- 主 session 若是 Opus：只做規劃、派工、審查；施工派給 Sonnet 子代理。
- 主 session 若是 Sonnet：直接施工；遇到上方升級條件時停下，請使用者切 Opus。

## Context 控制

每個 agent 先讀：`CLAUDE.md` → `docs/PROGRESS.md` → `docs/PROJECT_SPEC.md` 中與任務有關的章節 → 任務相關檔案。**不要掃描整個 repository。** 完成重大工作後更新 `docs/PROGRESS.md`。
