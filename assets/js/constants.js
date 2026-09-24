// 固定文字：熟悉程度、弱點分類。畫面與 domain 邏輯都只從這裡取得文字，不另外寫死。
// 對應 docs/PROJECT_SPEC.md §3.11。

export const FAMILIARITY_LEVELS = Object.freeze([
  { value: 1, label: '很不熟', cssClass: 'fam-1' },
  { value: 2, label: '還要再練', cssClass: 'fam-2' },
  { value: 3, label: '大致可以', cssClass: 'fam-3' },
  { value: 4, label: '可以上場', cssClass: 'fam-4' },
]);

export const UNPRACTICED_LABEL = '尚未練過';
export const UNPRACTICED_CSS_CLASS = 'fam-none';

export function familiarityLabel(value) {
  const found = FAMILIARITY_LEVELS.find((f) => f.value === value);
  return found ? found.label : UNPRACTICED_LABEL;
}

export function familiarityCssClass(value) {
  const found = FAMILIARITY_LEVELS.find((f) => f.value === value);
  return found ? found.cssClass : UNPRACTICED_CSS_CLASS;
}

export const WEAKNESS_CATEGORIES = Object.freeze([
  { code: 'pathology', label: '病因病理' },
  { code: 'anatomy', label: '重要解剖' },
  { code: 'symptoms', label: '症狀' },
  { code: 'examination', label: '檢查' },
  { code: 'technique', label: '手法' },
  { code: 'sequence', label: '操作順序' },
  { code: 'acupoints', label: '穴位' },
  { code: 'education', label: '衛教' },
  { code: 'other', label: '其他' },
]);

export function weaknessLabel(code) {
  const found = WEAKNESS_CATEGORIES.find((w) => w.code === code);
  return found ? found.label : code;
}
