# 按摩乙級上岸練習管理系統｜產品規格

版本：Foundation（2026-09-23）｜決策者：product-architect

---

## 1. 定位

本系統處理：**人 → 選題 → 實際練習 → 留下紀錄 → 找出弱點 → 再次練習 → 看見進步**。

不是教材網站。題目內容、考試重點由「乙級術科練習」負責；穴位背誦由「經穴背誦教練」負責。三個網站各自獨立，本系統只提供連結（見 `INTEGRATIONS.md`）。

### 成功標準

- 新同學可以加入；人數不寫死。
- 每人知道當天練哪些題、挑自己最不熟的、看到大家選了什麼。
- 實際練完留下紀錄；看得到以前不熟什麼、現在進步到哪、哪幾題要補、最後練習是什麼時候。
- 全盲（NVDA／VoiceOver／TalkBack）可獨立完成主要流程；低視能看得清楚文字、焦點、按鈕與狀態；200% 縮放可用；不只靠顏色傳遞資訊。

---

## 2. 技術選型（決策）

### 決定：靜態前端（GitHub Pages）＋ Google Apps Script API ＋ Google 試算表

| 條件 | Next.js + Supabase + Vercel | **靜態頁 + Apps Script + 試算表** |
|---|---|---|
| 成本 | 免費額度內 0 元，但兩個服務帳號 | 0 元；沿用既有 GitHub 與 Google 帳號 |
| 維護 | 框架升級、套件漏洞、Supabase 免費專案閒置一週會暫停 | 沒有套件要升級；試算表不會暫停 |
| 本機環境 | 需要 Node.js（本機目前沒有）；`node_modules` 放 OneDrive 會同步數萬個檔案，兩台電腦交替開發易衝突 | 只需要瀏覽器與 Python 內建伺服器 |
| 多人資料 | 強 | 足夠：預估 10 人 × 40 題 × 20 次 ≈ 8,000 列，試算表輕鬆負荷 |
| 備份 | 需另外設定 | 試算表有版本紀錄；可隨時下載 |
| 新增成員 | 需管理介面或 SQL | 網頁新增；必要時也能直接看試算表 |
| 無障礙 | 框架重繪容易搶焦點 | 原生 HTML＋手動 DOM 更新，焦點完全可控 |
| 與既有系統一致 | 不同 | 兩個既有網站都是 GitHub Pages 靜態頁 |

代價（已接受）：

- Apps Script 回應約 1–3 秒 → 顯示明確的「資料載入中」狀態；寫入後只更新局部畫面。
- 驗證不是真正的帳號登入（見 §6）。
- 同時寫入用 `LockService` 序列化。

### 前端做法

- 純 HTML／CSS／JavaScript ES modules，**無建置步驟、無框架、無 npm 相依**。
- 多頁式（每個路由一個 HTML 檔）：每頁有自己的 `<title>` 與 `<h1>`，瀏覽器上一頁天然可用，螢幕閱讀器換頁行為最穩定。
- 共用頁首、導覽直接寫在每個 HTML 內（不用 JS 注入），避免載入時閃動與報讀延遲。
- 資料存取層有兩個實作，介面相同：
  - `local`：資料存在瀏覽器 localStorage，由 `data/seed.json`（＋ 可選的 `private/seed.members.json`）初始化。用於開發、測試、離線示範。
  - `appsScript`：呼叫部署好的 Apps Script 網路應用程式。
  - 由 `assets/js/config.js` 切換。

### 未來可能的升級路徑

若人數或功能超出試算表能力（例如多群組、數十人同時使用），資料存取層介面不變，可換成 Supabase／Firebase，不需重寫頁面。

---

## 3. 資料模型

原則：只建立有實際需求的表。每張試算表工作表 = 一張表，第一列是欄位名稱。前端 JS 物件用 camelCase，試算表欄位用 snake_case，由 Apps Script 轉換。

所有時間戳記：ISO 8601 含時區，例 `2026-09-23T19:30:00+08:00`（台北時間）；純日期欄位（practiced_at）用 `YYYY-MM-DD`。畫面顯示為「9月23日」，非今年才加年份。ID：字串，新資料用 UUID（`crypto.randomUUID()`）。

### 3.1 participants｜參與者

| 欄位 | 說明 |
|---|---|
| participant_id | `p01`（種子）或 UUID |
| display_name | 顯示名稱（暱稱即可，不收真實姓名以外的個資） |
| created_at | |

### 3.2 study_groups｜練習群組

| 欄位 | 說明 |
|---|---|
| group_id | `g1` |
| name | 群組名稱 |
| status | `active`／`archived` |
| created_at | |

群組通行碼不存在試算表，存在 Apps Script 的「指令碼屬性」（`ACCESS_CODE_g1`），只存雜湊。

### 3.3 group_members｜群組成員

| 欄位 | 說明 |
|---|---|
| group_id | |
| participant_id | |
| role | `member`／`admin`（MVP 所有成員功能相同；admin 預留） |
| status | `active`／`paused`（暫停）／`left`（退出） |
| joined_at | |

暫停、退出不刪資料；歷史紀錄保留。選身份清單只列 `active`。

### 3.4 questions｜題目（只有中繼資料，不含教材內容）

| 欄位 | 說明 |
|---|---|
| question_id | `q01`…`q40` |
| number | 1–40 |
| title | 題名 |

### 3.5 practice_days｜題組（「第幾天」）

| 欄位 | 說明 |
|---|---|
| day_id | `d1`…`d5` |
| group_id | 題組屬於群組，未來可各群組重新分組 |
| sort_order | |
| label | 第一天 |
| theme | 神經類 |
| date | `YYYY-MM-DD`，該天實際上課日期（可能為空，空字串＝尚未排定）；首頁「五天選題總覽」用它決定哪一天標記為「今天」／「下一次上課」，見 §4.7 |

### 3.6 day_questions｜題組內的題目

| 欄位 | 說明 |
|---|---|
| day_id | |
| question_id | |
| sort_order | |

### 3.7 question_integrations｜外部系統對應（MVP 為空）

| 欄位 | 說明 |
|---|---|
| question_id | |
| system | `massageExam`／`acupointCoach` |
| external_id | 例：術科網站的題號 `27` |
| url | 若有專屬網址則填；空白代表用系統首頁 |

外部系統的首頁網址集中在 `assets/js/integrations.js`，不寫在任何頁面元件。

### 3.8 settings｜群組設定（key-value）

| key | 預設 | 說明 |
|---|---|---|
| selection_limit | `2` | 建議每人每個題組選幾題；`unlimited` = 不限 |
| current_day_id | `d1` | 群組「今天」練哪個題組 |
| current_round | `1` | 第幾輪（五個題組走完一輪可開新一輪） |
| stale_days | `14` | 超過幾天沒練算「很久沒練」 |

欄位：`group_id | key | value`。

### 3.9 selections｜選題（計畫）

| 欄位 | 說明 |
|---|---|
| selection_id | |
| group_id | |
| round | 第幾輪 |
| day_id | |
| participant_id | |
| question_id | |
| created_at | |
| canceled_at | 取消時填入；空白 = 有效 |

- 同一人、同一輪、同一題組、同一題只能有一筆有效選題（伺服器端檢查，重複送出視為成功）。
- 不同人可以選同一題。
- **選題 ≠ 練習完成。**

### 3.10 practice_sessions｜練習紀錄（每次一筆，永不覆蓋）

| 欄位 | 說明 |
|---|---|
| session_id | |
| group_id | |
| participant_id | |
| question_id | |
| practiced_at | 練習日期 `YYYY-MM-DD`（台北時間的日期，不含時刻；預設今天，可改） |
| familiarity | `1` 很不熟／`2` 還要再練／`3` 大致可以／`4` 可以上場 |
| weakness_codes | 逗號分隔，例 `anatomy,technique`；可空白 |
| stuck_point | 「這次卡在哪裡？」 |
| note | 自由備註 |
| source | `selection`（從選題來）／`draw`（模擬抽題）／`direct`（直接記錄） |
| selection_id | 若來自選題則填 |
| created_at | 送出時間 |
| voided_at | 作廢時填入（輸入錯誤時使用；不實際刪除） |

**決策：不建立獨立的 practice_weaknesses 表。** 弱點永遠和單次紀錄一起讀取，資料量小，統計在前端計算即可。存成 `weakness_codes` 欄位讓試算表一列就是一次完整練習，人工檢視也清楚。若未來需要跨群組統計再拆表。

### 3.11 固定選項（程式常數，`assets/js/constants.js`）

熟悉程度：

| 值 | 文字 |
|---|---|
| 1 | 很不熟 |
| 2 | 還要再練 |
| 3 | 大致可以 |
| 4 | 可以上場 |
| （無紀錄） | 尚未練過 |

弱點分類：

| code | 文字 |
|---|---|
| pathology | 病因病理 |
| anatomy | 重要解剖 |
| symptoms | 症狀 |
| examination | 檢查 |
| technique | 手法 |
| sequence | 操作順序 |
| acupoints | 穴位 |
| education | 衛教 |
| other | 其他 |

---

## 4. 衍生規則（透明、可解釋，不做黑盒評分）

以下規則全部是純函式，放在 `assets/js/domain/progress.js`，有單元測試。只計算未作廢的紀錄。

### 4.1 單題狀態（某人 × 某題）

- 練習次數、第一次狀態、最近一次狀態、最近練習日期（依 `practiced_at`，同日再依 `created_at`）。
- 無紀錄 → 「尚未練過」。
- 很久沒練：有紀錄，且最近練習日距今 ≥ `stale_days` 天。

### 4.2 我的待練題

我在「目前輪次」的有效選題中，**選題之後**還沒有任何練習紀錄的題目（比較紀錄的 `created_at` ≥ 選題的 `created_at`）。

### 4.3 我的弱題（排序規則，畫面上要顯示原因）

1. 最近一次「很不熟」
2. 最近一次「還要再練」
3. 很久沒練（最近一次為大致可以／可以上場，但已超過 `stale_days` 天）

同一層內：最後練習日期越久的越前面；再依題號。
「尚未練過」單獨列一區，不混入弱題排序（目標是每個人都看過所有題）。

每題顯示原因，例：「最近一次：還要再練（9月20日），共練 2 次」。

### 4.4 還差幾題

`selection_limit` −「我在目前輪次、今天題組的有效選題數」，最小為 0。不限時只顯示已選幾題。

**選題上限是「建議」不是硬性阻擋**：達到建議數量時，清楚提示「已選滿建議的 2 題」，但仍可再選（用詞為建議、目的是補弱點）。

### 4.5 首頁「下一步」建議（依序取第一個成立者）

1. 尚未選身份 → 「先選擇你是誰」
2. 今天題組還差 N 題 → 「到第一天選題，還差 N 題」
3. 有待練題 → 「練習第 27 題橈神經麻痺，練完留下紀錄」
4. 有弱題 → 「複習弱題：第 35 題…」
5. 以上皆無 → 「試試模擬抽題」

### 4.6 模擬抽題

- 題庫範圍：全部 40 題／某一天／我的弱題／尚未練習。
- 題庫超過 1 題時，不會抽到上一題（上一題記在 sessionStorage）。
- 題庫為空時說明原因（例：「你目前沒有弱題」），並建議改用其他範圍。

### 4.7 首頁「五天選題總覽」排序（`orderDaysForToday`）

依各題組的 `date`（可能為空）決定哪一天排在最前面，其餘固定依 `sort_order` 排列：

1. 今天剛好等於某天的 `date` → 該天排最前，標題加「今天：」前綴。
2. 不是上課日，但還有未來的 `date` → 最近的一個未來上課日排最前，標題加「下一次上課：」前綴。
3. 所有 `date` 都已過去、或沒有任何一天有 `date` → 不特別標記，依 `sort_order` 固定順序。
4. 沒有 `date` 的天永遠不會被標記，但仍照 `sort_order` 出現在清單中。
5. 每天標題後方用 `formatDateWithWeekday()` 顯示日期，格式「（10月9日 星期五）」；沒有 `date` 就不顯示。

---

## 5. 路由（多頁式）

| 頁面 | 檔案 | 主要內容 |
|---|---|---|
| 首頁 | `index.html` | 今天題組、我的選題、還差幾題、待練題、弱題前 3、下一步、五個題組入口 |
| 選擇身份 | `who.html` | 群組通行碼（每台裝置第一次）、選擇你是誰；名單沒有自己時可「以新同學身分加入」（輸入顯示名稱） |
| 當日選題 | `day.html?d=d1` | 題組全部題目；每題：我是否選、幾人選、誰選、選擇／取消、查看紀錄、開啟術科 |
| 單題紀錄 | `question.html?q=q27` | 摘要（次數、第一次、最近一次、最近日期、常見弱點）、完整歷史、新增紀錄入口、外部連結 |
| 新增紀錄 | `record.html?q=q27&from=selection` | 熟悉程度、弱點、卡在哪裡、備註、練習日期 |
| 我的弱題 | `weak.html` | 依 §4.3 排序的弱題＋原因；尚未練過；依狀態分區查看 |
| 40 題總表 | `all.html` | 表格；篩選：狀態、第幾天、題號 |
| 模擬抽題 | `draw.html` | 選範圍、抽題、結果、開啟術科、留下紀錄 |
| 群組 | `group.html` | 成員名單（新增、暫停、退出）、今天題組、建議選題數、大家的選題總覽 |

主要導覽（每頁相同）：首頁｜40題總表｜我的弱題｜模擬抽題｜群組。共 5 個，不做側邊欄。

未選身份時，除 `who.html` 外的頁面顯示提示與前往連結，不自動跳轉（避免螢幕閱讀器使用者迷失）。

---

## 6. 身份與存取

- 每個群組一組**群組通行碼**，由群組建立者設定、口頭告知同學。
- 每台裝置第一次使用：輸入通行碼 → 從名單選自己 → 存在該裝置 localStorage。之後免輸入。
- 所有 API 呼叫（含讀取）都要帶通行碼；錯誤通行碼一律拒絕。避免陌生人讀到同學名字。
- 通行碼放在 POST 內容，不放網址。
- **已知限制**：知道通行碼的人可以用任何成員的身份操作。對少數互相信任的同學練習群組可接受；若需要個人層級保護，未來可加個人 PIN。
- 不收集真實姓名、電話、身分證等個資；顯示名稱用暱稱即可。

### 6.1 Apps Script 端的通行碼保護（Phase 5 決議）

- 通行碼至少 6 個字（可用中文詞＋數字，例「上岸加油2026」），方便口頭告知又不易猜中。
- 指令碼屬性存 `ACCESS_SALT_g1`（隨機）與 `ACCESS_HASH_g1` = SHA-256(salt + 通行碼)；由 `setAccessCode()` 函式設定，使用者在 Apps Script 編輯器執行時以對話框輸入，不寫在程式碼裡。
- 暴力猜測防護：用 `CacheService` 記錄 10 分鐘內的全域失敗次數，超過 30 次就暫停驗證 10 分鐘，回傳「嘗試次數過多，請 10 分鐘後再試」。
- 每個請求都驗證通行碼；寫入操作額外檢查 `participantId` 是該群組的 active 成員（`addParticipant` 除外）。
- 伺服器端輸入驗證：`familiarity` 只接受 1–4；`weaknessCodes` 只接受 §3.11 的 code；文字欄位去頭尾空白、上限 1000 字；`displayName` 1–20 字；日期必須是有效的 `YYYY-MM-DD` 且不晚於今天。
- 試算表不公開分享；Apps Script 以擁有者身份執行，「誰可以存取」設為「任何人」（網頁才能呼叫），保護完全靠通行碼。
- 防止試算表公式注入：寫入文字欄位時，若開頭是 `=`、`+`、`-`、`@`，前面加上單引號。

### 6.2 公開資料與私人資料

- 程式碼庫（未來若公開在 GitHub Pages）只含題目、題組與示範資料。
- 真實成員名單只在 Google 試算表與 `private/`（已加入 `.gitignore`）。

---

## 7. API 契約（兩種 adapter 相同介面，皆為 async）

```
getBootstrap()                       → { group, settings, participants, members, questions, days, questionIntegrations, selections, sessions }
verifyAccess(accessCode)             → { group }
selectQuestion({ participantId, dayId, questionId })     → { selection, daySelections }
cancelSelection({ participantId, selectionId })          → { daySelections }
createSession({ participantId, questionId, practicedAt, familiarity, weaknessCodes, stuckPoint, note, source, selectionId })  → { session }
voidSession({ participantId, sessionId })                → { session }
addParticipant({ displayName })                          → { participant, member }
updateMemberStatus({ participantId, status })            → { member }
updateSettings({ currentDayId?, selectionLimit?, currentRound? }) → { settings }
```

- `getBootstrap` 一次回傳整個群組需要的資料（量很小），每頁載入呼叫一次。
- 寫入回傳更新後的相關資料，讓頁面只更新局部、不重新渲染整頁、不移動焦點。
- 錯誤格式：`{ ok: false, code, message }`，`message` 為可直接顯示的繁體中文。
- Apps Script 端：所有請求用 POST、`Content-Type: text/plain`（避免 CORS 預檢），body 為 JSON `{ action, accessCode, payload }`；寫入時使用 `LockService`。

---

## 8. 檔案結構

```
index.html who.html day.html question.html record.html weak.html all.html draw.html group.html
assets/css/base.css
assets/js/config.js            後端模式、Apps Script 網址
assets/js/integrations.js      外部系統網址（唯一出處）
assets/js/constants.js         熟悉程度、弱點分類文字
assets/js/api/index.js         依設定選 adapter
assets/js/api/local.js
assets/js/api/appsScript.js
assets/js/domain/progress.js   純函式規則
assets/js/ui/dom.js            建立元素、狀態訊息 announce()
assets/js/ui/session.js        目前身份（localStorage）
assets/js/pages/*.js           每頁一支
data/seed.json                 題目、題組、預設設定（公開）
private/seed.members.json      真實初始成員與選題（不進 Git）
apps-script/                   Code.gs、部署說明
tests/unit.html + tests/*.test.js   瀏覽器執行的單元測試
docs/
```

---

## 9. MVP 實作計畫

每個階段完成建立 Git checkpoint（tag 或 commit 訊息標示）。

### Phase 1：Foundation ✅（本次）
文件、agents、資料模型、路由、技術選型、種子資料。checkpoint：`foundation`

### Phase 2：選題與練習紀錄 MVP（fullstack-builder / Sonnet）
1. `base.css`：依 `ACCESSIBILITY.md` 的字體、色彩、焦點、觸控尺寸。
2. `config.js`、`integrations.js`、`constants.js`、`api/local.js`、`domain/progress.js`＋單元測試。
3. `who.html`、`index.html`、`day.html`（選擇／取消、幾人選、誰選）。checkpoint：`selection-mvp`
4. `record.html`、`question.html`（紀錄、歷史、作廢）。checkpoint：`practice-history`
5. `group.html`（新增成員、暫停／退出、今天題組、建議題數）。

### Phase 3：弱題與總覽
`weak.html`、`all.html`。checkpoint：`weak-questions`

### Phase 4：模擬抽題與外部整合
`draw.html`、術科／經穴連結集中管理。checkpoint：`integrations`

### Phase 5：Apps Script 後端與上線
`apps-script/Code.gs`、部署說明、`api/appsScript.js`。**需要使用者本人**：建立試算表、部署 Apps Script、設定通行碼、決定是否公開 GitHub repo。

### Phase 6：無障礙審查（accessibility-reviewer / Opus）
NVDA、VoiceOver、TalkBack、鍵盤、低視能、200% 縮放、對比、回歸。checkpoint：`accessibility-review`

---

## 10. 需求矛盾與模糊處的決議

| # | 問題 | 決議 |
|---|---|---|
| 1 | 「今天練什麼」— 但「第一天」是題組不是日期 | 群組設定 `current_day_id`，任何成員可在群組頁切換 |
| 2 | 「建議每人選 2 題」vs「選滿要提示」 | 建議上限：提示但不阻擋；可設定 1／2／3／不限 |
| 3 | 五個題組走完之後再練一輪，舊選題怎麼辦 | 選題帶 `round`；首頁只看目前輪次；練習紀錄不分輪次，累積計算進步 |
| 4 | 「登入」vs 全盲使用者低門檻、零成本 | 群組通行碼＋選身份；限制寫在 §6 |
| 5 | 建議的 Next.js/Supabase vs 本機無 Node、OneDrive 雙機同步、低維護 | 靜態頁＋Apps Script（§2） |
| 6 | 要求 unit／E2E 測試 vs 無 Node | 單元測試在瀏覽器執行（`tests/unit.html`）；E2E 與鍵盤流程用 Claude 內建瀏覽器驗證；日後若安裝 Node（專案外）可加 Playwright |
| 7 | 列出 practice_weaknesses 表 vs「保持簡單」 | 併入 practice_sessions（§3.10） |
| 8 | 「我的弱題」要看五種狀態 vs 優先呈現弱題 | 同頁兩部分：優先排序清單＋依狀態分區 |
| 9 | 題目 deep link | 術科網站目前不支援網址直達某題（見 INTEGRATIONS）；MVP 開首頁 |
| 10 | 題名與術科網站不一致：第 13 題（腰椎退行性變化 vs 腰退行性脊椎炎）、第 15 題（髖關節骨關節炎 vs 髖關節股關節炎） | 已確認（2026-09-23）：維持同學的寫法，意思相同、題號對應正確，不需修改 |
| 11 | 種子資料含同學名字，若 repo 公開會外流 | 真實成員放 `private/`，不進 Git |
| 12 | 輸入錯誤的紀錄 | 「作廢」而非刪除或覆蓋；歷史中標示已作廢、不列入統計 |
