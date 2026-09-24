# 按摩乙級上岸練習管理系統

管理「人 → 選題 → 練習 → 紀錄 → 弱點 → 進步」。**不是教材網站。**

## 先讀
1. `docs/PROGRESS.md`（目前進度、下一步）
2. `docs/PROJECT_SPEC.md` 中與任務有關的章節
3. 做 UI 必讀 `docs/ACCESSIBILITY.md`
不要掃描整個 repository。完成重大工作後更新 `docs/PROGRESS.md`。

## 不可違反
- 不修改、不複製兩個既有網站（乙級術科練習、經穴背誦教練）；外部網址只在 `assets/js/integrations.js`。
- 純 HTML／CSS／JS ES modules，無框架、無 npm、無建置。
- 選題（selections）≠ 練習（practice_sessions）；練習紀錄永不覆蓋，錯誤用「作廢」。
- 不寫死成員姓名、人數、每人題數；題組由資料層管理。
- 真實成員資料只放 `private/`（不進 Git）與 Google 試算表。
- 全盲與低視能都是主要使用者：原生 HTML、完整按鈕名稱、焦點不掉、狀態只播一句、不只靠顏色、200% 縮放可用。

## 執行
- 本機：`.claude/launch.json` 的 `app`（Python 內建伺服器，port 8765），`config.js` 設 `local` 模式。
- 單元測試：瀏覽器開 `/tests/unit.html`。配色：`python tests/contrast.py`。

## 安全
禁止 force push、刪除正式資料、建立會產生費用的服務、需要使用者帳號的操作（先問）。

## 模型分工
見 `docs/MODEL_STRATEGY.md`。施工用 fullstack-builder（Sonnet），資料整理用 content-worker（Haiku），架構／無障礙審查才用 Opus。
