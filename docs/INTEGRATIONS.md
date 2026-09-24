# 外部系統整合

本系統**只連結**、不複製、不修改以下兩個既有網站。它們是獨立的 repository 與網站，本專案任何工作都不得改動它們。

| 系統 | 網址 | 負責 |
|---|---|---|
| 乙級術科練習（Massage Exam） | https://young6663.github.io/massage-exam/#main-content | 40 題題目內容、考試重點、術科練習資料 |
| 經穴背誦教練（Acupoint Coach） | https://young6663.github.io/acupoint/ | 經穴、穴位背誦與練習 |

## 1. 唯一出處

外部網址只寫在 `assets/js/integrations.js`。頁面一律呼叫：

```js
import { massageExamLink, acupointCoachLink } from './integrations.js';
massageExamLink(question, questionIntegrations)  // → { href, isDeepLink }
acupointCoachLink()                              // → { href }
```

禁止在 HTML 或頁面程式中直接寫外部網址。

## 2. 題目對應（question_integrations）

資料表 `question_integrations`（見 PROJECT_SPEC §3.7）可為每題指定：

- `system`：`massageExam` 或 `acupointCoach`
- `external_id`：外部系統內的識別碼（術科網站的題號，如 `27`）
- `url`：專屬網址

優先順序：該題有 `url` → 用它；否則 → 系統首頁。MVP 此表為空，全部開首頁。

本系統的資料庫**不存放**任何術科教材或經穴內容。

## 3. 深層連結（deep link）現況調查（2026-09-23，唯讀檢查）

### 乙級術科練習
- 每題有 `id="topic-27"`、`data-num="27"`，並有 JS 函式 `toggleTopic('27')` 切換顯示。
- 頁面**沒有**讀取 `location.hash` 或網址參數的程式 → 目前無法用網址直接打開某一題。
- 題號與本系統一致（1–40）。

### 經穴背誦教練
- 只有 `#main` 錨點，無題目或穴位層級的網址。
- 目前沒有「某一題對應哪些穴位」的資料，因此本系統只提供一個全域的「前往經穴背誦教練」。

### 未來若要支援術科深層連結
需要在**術科網站**加一小段：載入時若網址是 `#topic-27`，就呼叫 `toggleTopic('27')`。
這屬於修改既有網站，**必須由使用者決定並在該 repository 另外進行**，不在本專案範圍。
完成後，本系統只要在 `integrations.js` 把 `massageExam.deepLinkTemplate` 設為 `…/massage-exam/#topic-{id}`，所有連結即自動生效，不需改頁面。

## 4. 使用者流程

1. 在本系統選題或抽題 →「開啟乙級術科練習：第27題」
2. 在同一分頁前往術科網站練習（目前開首頁，需自行找第 27 題）
3. 用瀏覽器「上一頁」回到本系統 →「留下第27題練習紀錄」

連結文字要讓使用者知道目前會開首頁，但不要每題重複一大段說明：

- `isDeepLink === false` 時，連結文字為「開啟乙級術科練習首頁」（隱藏文字不需再加題號，因為目的地都相同）。
- 在頁面開頭（當日選題、單題紀錄、抽題結果）只說一次：「術科網站目前只能開首頁，請在該網站自行選題。」
- 支援深層連結後，連結文字改為「開啟乙級術科練習」＋隱藏文字「：第27題」，並移除開頭說明。
