# 進度

最後更新：2026-09-23

## 目前階段
**Phase 6 無障礙審查的自動化修正已完成**（fullstack-builder / Sonnet）→ 下一步：使用者本人依 `apps-script/DEPLOY.md` 完成 Phase 5 部署、
用真人 NVDA／VoiceOver／TalkBack 依 `docs/A11Y_REVIEW_2026-09-23.md` §3 的手動測試腳本實測一次（自動化工具沒有真的螢幕報讀器）。

## 已完成
- [x] Git 初始化（main）
- [x] CLAUDE.md、PROJECT_SPEC、PROGRESS、MODEL_STRATEGY、INTEGRATIONS、ACCESSIBILITY
- [x] `.claude/agents/` 五個 agent
- [x] 資料模型、路由、API 契約、衍生規則（PROJECT_SPEC §3–§7）
- [x] 技術選型：靜態前端 + Apps Script + Google 試算表（PROJECT_SPEC §2）
- [x] 整合層 `assets/js/integrations.js`（含共用的 `massageExamLinkText()` 連結文字產生器）
- [x] 種子資料 `data/seed.json`（40 題、五天題組）、`private/seed.members.json`（初始成員與 4 筆選題，不進 Git）
- [x] 配色對比計算 `tests/contrast.py`（全數通過）
- [x] `assets/css/base.css`：字級／色彩／焦點／觸控尺寸皆依 ACCESSIBILITY §7–§11，forced-colors 友善；
      新增 `.is-busy`（處理中）、`.link-action`（前往另一頁的文字連結）、`.question-list > li.selected`（已選擇左框線）樣式
- [x] `config.js`、`constants.js`、`api/index.js`、`api/local.js`（local 後端，localStorage + seed 初始化）、
      `domain/progress.js`（§4 全部衍生規則的純函式，含 Phase 3 新增的 `questionsByStatus`／`dayForQuestion`／`filterAllQuestions`）、
      `ui/dom.js`（含里程碑審查新增的 `setBusy`／`clearBusy`／`isBusy`／`setBusyText` 忙碌狀態共用工具）、`ui/session.js`、`ui/layout.js`
- [x] `tests/unit.html` + `tests/harness.js` + `tests/progress.test.js` + `tests/integrations.test.js`，瀏覽器執行全數 PASS（共 49 項）
- [x] `who.html`／`index.html`／`day.html`：通行碼＋選身份＋新同學加入、首頁（今天題組／下一步／我的選題／我的弱題前3／所有題組／其他練習工具）、當日選題（選擇／取消、幾人選、誰選、熟悉度標籤）。checkpoint `selection-mvp`
- [x] `record.html`／`question.html`：練習紀錄表單（含驗證錯誤摘要與焦點管理）、單題摘要與歷史（含作廢，作廢後焦點移至「練習歷史」標題）。checkpoint `practice-history`
- [x] `group.html`：成員清單（暫停／恢復／退出，就地更新既有按鈕；退出後按鈕消失時焦點移至成員名稱）、新增同學、今天題組／建議選題數設定、大家的選題總覽（動作後即時更新）
- [x] **里程碑審查修正**（2026-09-23）：處理中狀態改用 `aria-disabled` + `.is-busy`（不用 `disabled`，避免按鈕失焦）；
      短操作（選擇/取消、暫停/恢復/退出）忙碌中不換文字；動作按鈕（實心）與取消類按鈕（白底主色框線）、前往另一頁連結（文字連結）三者視覺區分；
      已選擇的題目左側加主色框線＋「你已選擇」加粗；術科連結文字整合進 `massageExamLinkText()` 單一出處。
- [x] `weak.html`／`pages/weak.js`：需要優先補強（§4.3 排序＋原因文字）、尚未練過（count＋清單）、依狀態查看（select 篩選＋就地更新＋announce）。
- [x] `all.html`／`pages/all.js`：40 題總表，狀態／第幾天／題號三個篩選條件即時套用，`table-wrap` 可橫向捲動，`th scope="row"`，`caption` 顯示目前篩選與題數，空結果有說明文字。checkpoint `weak-questions`
- [x] `draw.html`／`pages/draw.js`：抽題範圍（全部40題／某一天／我的弱題／尚未練習）、抽題結果（題目、題組、術科連結、留下紀錄連結、查看紀錄、經穴背誦教練連結）、
      不重複抽到上一題（`sessionStorage` key `ylpm:lastDraw`）、題庫為空時說明原因並建議改選範圍、焦點留在「抽題」按鈕。
      首頁新增「其他練習工具」區塊（前往經穴背誦教練）。checkpoint `integrations`
- [x] **Phase 5 Apps Script 後端與 appsScript adapter**：
  - `apps-script/Code.gs`（doGet／doPost 路由、通行碼驗證、暴力猜測防護、LockService 序列化寫入）、
    `apps-script/SheetHelpers.gs`（工作表讀寫、snake_case↔camelCase、SHA-256 通行碼雜湊、公式注入防護、日期格式）、
    `apps-script/Handlers.gs`（§7 全部 9 個 action 的商業邏輯）、
    `apps-script/Setup.gs`（`setupSheets`／`setAccessCode`／`importMembers`、試算表選單 `onOpen`）、
    `apps-script/SeedData.gs`（從 `data/seed.json` 轉出的種子資料，已用腳本逐欄比對過一致）。
  - `assets/js/api/appsScript.js`：與 `local.js` 相同介面，text/plain POST 避免 CORS 預檢，20 秒逾時，
    `ACCESS_DENIED`（非 verifyAccess 呼叫時通行碼失效）會清除裝置身份並提示按頁首「切換身份」重新輸入。
  - `assets/js/api/index.js` 改為依 `config.backend` 動態選擇 adapter（原本 appsScript 分支是丟例外的佔位）。
  - **輸入驗證對齊 §6.1，local 與 appsScript 兩邊行為一致**：`local.js` 的 `createSession` 補上日期格式／不晚於今天、
    弱點分類白名單、文字欄位 1000 字上限；`addParticipant` 補上顯示名稱 20 字上限。
  - **修正 who.js 的時序問題**：原本 `getBootstrap()` 在通行碼驗證前就呼叫，appsScript 後端「所有請求都要帶通行碼」會失敗；
    改成只在已驗證裝置時於 `init()` 呼叫，並在通行碼驗證成功當下呼叫（新增 `ui/session.js` 的 `setVerifiedAccessCode()`，
    讓「驗證成功、還沒選身份」這段中間狀態也能讀到通行碼）。
  - `tests/contract.html` + `tests/contract.test.js`：對 local／appsScript 兩個 adapter 跑同一組 12 步 API 契約測試
    （bootstrap 形狀、通行碼驗證、重複選題冪等、取消、驗證錯誤、作廢別人紀錄被拒、清理退出），appsScript 模式需要
    使用者輸入通行碼並有明確警語（會寫入真實試算表）。
  - `apps-script/DEPLOY.md`：給螢幕報讀器使用者的逐步部署指南（含 Google 授權畫面、`getUi()` 只能透過試算表選單執行的
    疑難排解、重新部署／備份／換通行碼）。checkpoint `apps-script-backend`

## Phase 5 里程碑審查（Opus，2026-09-23）
- 通過：通行碼雜湊比對、錯誤不外洩內部細節、寫入 LockService、輸入驗證與 local.js 一致。
- 已修：使用者輸入文字欄位加入純文字格式（公式注入第一道防護；單引號前綴在 Google 試算表不會真的保存，只作第二道）；伺服器錯誤寫入 Apps Script 執行紀錄。
- 接受的風險：防暴力猜測為全域計數，遭攻擊時合法使用者也會被暫停 10 分鐘。

## Phase 6 無障礙審查自動化修正（fullstack-builder / Sonnet，2026-09-23）
依 `docs/A11Y_REVIEW_2026-09-23.md`（accessibility-reviewer / Opus）修正 7 項嚴重問題與可放心做的建議項目，詳細清單與逐項驗證見該報告最後的「修正狀態」章節。重點：
- **S1** who.html：通行碼驗證成功後，焦點改移到「選擇身份」標題（`tabindex="-1"`），不再掉回頁首；狀態句縮成「通行碼正確。」。
- **S2** 全站：9 頁都在 `h1`／`#status` 之後加靜態的「資料載入中…」文字（不進 live region），載入成功或失敗都會隱藏；新增 `dom.js` 的 `hideLoading()`。
- **S3／S4** record.html／group.html：欄位旁加 `aria-invalid`＋`aria-describedby`（或 legend 內嵌錯誤文字）；伺服器回傳的欄位類錯誤（日期、字數、熟悉程度）也改走錯誤摘要＋欄位錯誤；group.html 三個表單的成功訊息與 draw.html 空題庫的原因都改成看得見、非 live 的區塊文字。
- **S5** 全站：`#error` 空的時候不再用 `display:none`，改成只收起外觀，一直留在無障礙樹裡（避免部分螢幕報讀器對「重新出現的 live region」不唸）。
- **S6** all.html：題號欄位改成 `type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2"`，套用一般輸入框樣式（18px、44px 高）。
- **S7** weak.html：「尚未練過」不再列出全部題目，只顯示題數＋連到 `all.html?status=unpracticed`（all.js 讀取並預選篩選條件）的連結；「依狀態查看」預設不選狀態、不列清單，選了才顯示。
- **A2** day.html：題目清單前加看得見的 `<h2>本日題目</h2>`，修正 axe heading-order（h1→h3 跳級）。
- **A1** weak.html／all.html：篩選改成停止操作 500ms 後才篩選並播報一次（新增 `dom.js` 的 `debounce()`），避免方向鍵瀏覽 select、或題號欄每個字都觸發播報。
- **A3** day.html／首頁：選題超過建議數量時，狀態句改成「超過建議的 N 題」而不是含糊的「已達建議數量」。
- **A5** 全站頁首：「切換」連結改成「切換<span class="vh">身份</span>」，NVDA 連結清單看得出切換什麼；連帶補齊 44px 觸控範圍（class="link-action"）。
- **A6** question.html：儲存確認訊息顯示後用 `history.replaceState` 拿掉網址的 `&saved=`；作廢紀錄後把確認文字收起來，不再留著跟內容不符的舊訊息。
- **A7** 全站：`[tabindex="-1"]:focus` 補上跟 `:focus-visible` 一樣的可見焦點框（Chromium 在滑鼠觸發的程式化 focus 上不會顯示 `:focus-visible`），`main` 例外不需要。
- **A9（②③）** record.html：錯誤摘要連結改成 `preventDefault()`＋`field.focus()`＋`scrollIntoView({block:'start'})`，避免 Chromium 把畫面捲到欄位置中導致 legend 被捲出畫面外。
- **A10** record.html：拿掉緊接在 h1 後面又唸一次題名的 `#question-label`；兩個 textarea 加 `maxlength="1000"`。
- **A11** draw.html：術科網站限制的說明文字移到抽題結果區，抽題後才會被讀到。
- **A12** base.css：拿掉 `forced-colors` 底下的 `forced-color-adjust: none`，改成只補邊框顏色（`ButtonText`／`Highlight`），不再蓋掉使用者在 Windows 高對比主題下自選的配色。
- **A13** all.html：`#filter-controls` 改成 `class="filter-controls"`，讓既有 CSS 規則生效。

**未做的建議（原因）**：
- **A4（40 題總表的題名連結）**：只加大了首頁與其他頁面的獨立連結觸控範圍，全部 40 題表格內 `<th>` 裡的題名連結沒有改，因為在既有的表格版面（`th`/`td` padding、橫向捲動容器）裡加 `min-height: 2.75rem` 有較高的排版風險，且目前 24–26px 已符合 WCAG 2.2 AA 的 24px 下限，留到之後和表格版面一併調整比較安全。
- **A8（who.html 通行碼與身份欄位）**：欄位型錯誤（通行碼、顯示名稱）已比照 S3／S4 加上 `aria-invalid`／欄位旁錯誤文字；但「你是誰？」這組 radio 選錯的頂層錯誤沒有比照 record.html 熟悉程度做成 legend 內嵌錯誤文字，因為 who.html 目前的裝置流程（成功後就換頁離開）用頂部 `#error` 已經夠用，不想為了一致性而多繞一層。
- **A9①（拿掉錯誤摘要的 `role="alert"`）**：報告本身標注「推測，需第 3 節 NVDA 步驟 6 用真人確認是否真的唸兩次」，這裡沒有真的螢幕報讀器可以驗證，先不動，留給真人測試後再決定是否拿掉。

**自動化驗證**（Claude 內建瀏覽器，local 後端，`localLatencyMs: 300`）：
- `tests/unit.html` 49 項全 PASS、`tests/contract.html`（local）12 項全 PASS。
- 9 頁分別注入 axe-core 4.10.2（含 record.html 錯誤狀態）：0 violations。
- 逐項用 `document.activeElement`、`getComputedStyle`、`#status`／`#error` 內容手動重現 S1～S7 的修正前情境並確認修正生效（見上方清單）。
- 320px 寬：record.html（含錯誤狀態）、all.html、question.html 都沒有 body 橫向捲動。
- 附帶發現一個跟本次無障礙修正無關的既有小問題：`tests/contract.html` 在 localStorage 完全空白時直接開啟會找不到 `data/seed.json`
  （`local.js` 用相對路徑 `fetch('data/seed.json')`，從 `/tests/contract.html` 解析會變成 `/tests/data/seed.json`）；
  只要先開過任何一個根目錄頁面（例如 `who.html`）讓 localStorage 有種子資料，`contract.html` 就能正常執行。不在本次任務範圍內，未修改。

**未驗證**：Windows 高對比佈景主題（forced-colors，A12）、真人 NVDA／VoiceOver／TalkBack（`docs/A11Y_REVIEW_2026-09-23.md` §3 手動測試腳本）、200% 瀏覽器縮放（實測了 320px 寬與 axe，未逐一實測 200% zoom）、Apps Script 後端下的同一批修正（本機仍是 local 後端）。

## 下一步（Phase 5 收尾、Phase 6 手動驗證）
1. Phase 5 收尾（需使用者本人操作，見 `apps-script/DEPLOY.md`）：建立 Google 試算表、貼上 `apps-script/` 5 個檔案、
   執行 `setupSheets`／`setAccessCode`／（選用）`importMembers`、部署網路應用程式、把網址填進 `assets/js/config.js`
   並切換 `backend: 'appsScript'`、跑一次 `tests/contract.html?backend=appsScript`、決定 GitHub repo 是否公開。
2. Phase 6 手動驗證（需使用者本人，見 `docs/A11Y_REVIEW_2026-09-23.md` §3）：用真的 NVDA（Windows）、VoiceOver（iPhone）、
   TalkBack（Android，如果有裝置）依腳本逐項操作，確認自動化工具測不出來的部分（螢幕報讀器實際唸出的內容與順序、
   `role="alert"` 在 Safari／VoiceOver 上的行為、iOS 錨點連結焦點行為等）；Windows「對比佈景主題」下確認 A12 的高對比修正。

## Known issues／待使用者確認
- 術科網站不支援網址直達某題 → MVP 開首頁（INTEGRATIONS §3），頁面開頭已加一句說明。
- Apps Script 每次請求約 1–3 秒；Phase 2 先每頁載入時抓一次，之後視實測再加快取。
- 上線（Phase 5）需要使用者本人：建立 Google 試算表、部署 Apps Script、設定群組通行碼、決定 GitHub repo 公開與否。
- 本機沒有 Node.js：測試改在瀏覽器執行（見 PROJECT_SPEC §10 #6）。
- `window.confirm()` 在 Claude 內建瀏覽器驗證時固定回傳 `false`（自動化環境限制），退出成員／作廢紀錄的確認流程改用「先暫時覆寫 `window.confirm` 回傳 `true`」的方式驗證過邏輯正確；真實瀏覽器操作不受影響，仍建議上線前用真人手動確認一次對話框行為。
- 尚未在真實 NVDA／VoiceOver／TalkBack 上實測本次新增的三頁（weak.html／all.html／draw.html），留給 Phase 6 無障礙審查。
- **Apps Script 後端（`apps-script/*.gs`）尚未在真正的 Google 環境跑過**，本機沒有 Google 帳號可以部署測試（見「付費使用天條」／帳號操作先問的規則，且建立 Apps Script 部署屬於需要使用者本人操作的項目）。
  已做的驗證：把 5 個 `.gs` 檔案的純邏輯（不含 Google 專屬 API 的部分改用手刻假物件模擬 `SpreadsheetApp`／`PropertiesService`／
  `CacheService`／`LockService`／`Utilities`／`ContentService`）在瀏覽器裡跑過一次性的離線測試頁（36 項全過，測完即刪除，
  不在 repo 裡），涵蓋：SHA-256 雜湊正確性（比對已知測試向量）、`setupSheets` 建表與種子資料、`setAccessCode`、
  `doPost` 通行碼驗證與錯誤代碼、暴力猜測鎖定、公式注入防護（寫入加單引號、讀出還原）、9 個 action 的商業邏輯與驗證規則、
  `importMembers` 冪等匯入。**沒有驗證到**：真正的 Google Sheets 讀寫行為（欄位格式轉換、大量資料效能）、真正的
  `PropertiesService`／`CacheService`／`LockService` 持久化與跨請求行為、實際部署後的網址／CORS／逾時、Apps Script
  編輯器裡 `getUi()` 的實際執行情境限制（`apps-script/DEPLOY.md` 已用最保守的方式說明：一律透過試算表選單執行
  `setupSheets`／`setAccessCode`／`importMembers`，避免在編輯器直接執行可能遇到的情境限制）。
  使用者依 `apps-script/DEPLOY.md` 部署完成後，務必跑一次 `tests/contract.html?backend=appsScript` 做真正的整合驗證。

## 重要決策
| 日期 | 決策 | 理由 |
|---|---|---|
| 2026-09-23 | 靜態頁 + Apps Script + 試算表，不用 Next.js/Supabase | 0 成本、無套件維護、本機無 Node、OneDrive 雙機同步不適合 node_modules、Supabase 免費專案閒置會暫停 |
| 2026-09-23 | 多頁式、無框架 | 螢幕閱讀器換頁行為最穩定、焦點完全可控 |
| 2026-09-23 | 弱點併入 practice_sessions，不另建表 | 保持簡單，一列一次練習 |
| 2026-09-23 | 選題上限為「建議」，提示不阻擋 | 需求用詞為建議，目的是補弱點 |
| 2026-09-23 | 選題帶 round（輪次） | 五個題組可重複練多輪 |
| 2026-09-23 | 群組通行碼 + 選身份，非帳號登入 | 全盲使用者低門檻、零成本；限制已記錄 |
| 2026-09-23 | 真實成員資料不進 Git | repo 若公開不外流同學名字 |
| 2026-09-23 | 外部連結同分頁開啟 | 手機螢幕閱讀器切換分頁易迷失 |
| 2026-09-23 | §6.1「寫入操作額外檢查 participantId 是 active 成員」只加在 appsScript 後端，不加進 local.js | local 是開發／示範用，不必模擬完整安全限制；`updateMemberStatus`（本身就是切換狀態的機制）與 `updateSettings`（契約裡沒有 participantId）不適用這條規則 |
| 2026-09-23 | 通行碼失效（`ACCESS_DENIED`）時清掉裝置身份，錯誤訊息用純文字提到「who.html」而不是可點的連結 | 主導覽沒有連回 who.html 的入口（設計上只在初次選身份時進入），螢幕報讀器使用者要靠訊息文字知道去哪；曾經考慮在 `dom.js` 加一個「錯誤訊息＋連結」的通用工具，但 `showError` 現有的「先清空再 setTimeout 寫入」機制會跟頁面自己接著呼叫的 `showError` 互相蓋掉，貿然加會有時序 bug，改用純文字訊息更穩妥 |
| 2026-09-23 | 第 13、15 題題名維持同學寫法（與術科網站字面不同但同一題，題號對應正確） | 使用者確認意思相同 |
| 2026-09-23 | local.js 的種子資料路徑改用 `import.meta.url` 解析 | 從 `tests/` 子資料夾開頁面時相對路徑會錯，全新瀏覽器找不到題目資料 |
