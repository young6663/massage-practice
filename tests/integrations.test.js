import { test, assert, assertEqual } from './harness.js';
import { massageExamLink, acupointCoachLink, massageExamLinkText } from '../assets/js/integrations.js';

test('massageExamLink：沒有對應資料時用題號組深層連結 #topic-27', () => {
  const link = massageExamLink({ id: 'q27', number: 27 }, []);
  assertEqual(link.isDeepLink, true);
  assertEqual(link.href, 'https://young6663.github.io/massage-exam/#topic-27');
});

test('massageExamLink：有 questionIntegrations 對應網址時使用該網址並標記 deepLink', () => {
  const integrations = [{ questionId: 'q27', system: 'massageExam', externalId: '27', url: 'https://example.test/q27' }];
  const link = massageExamLink({ id: 'q27', number: 27 }, integrations);
  assertEqual(link.href, 'https://example.test/q27');
  assertEqual(link.isDeepLink, true);
});

test('massageExamLink：其他題目的對應資料不影響本題', () => {
  const integrations = [{ questionId: 'q01', system: 'massageExam', url: 'https://example.test/q01' }];
  const link = massageExamLink({ id: 'q27', number: 27 }, integrations);
  assertEqual(link.href, 'https://young6663.github.io/massage-exam/#topic-27');
});

test('acupointCoachLink：回傳經穴背誦教練首頁', () => {
  const link = acupointCoachLink();
  assert(link.href.includes('acupoint'), 'href 應指向經穴背誦教練網站');
});

test('massageExamLinkText：非深層連結時只顯示開首頁文字，不重複題號', () => {
  const children = massageExamLinkText({ isDeepLink: false }, { number: 27 });
  assertEqual(children.length, 1);
  assertEqual(children[0], '開啟乙級術科練習首頁');
});

test('massageExamLinkText：深層連結時附上視覺隱藏的題號', () => {
  const children = massageExamLinkText({ isDeepLink: true }, { number: 27 });
  assertEqual(children[0], '開啟乙級術科練習');
  assertEqual(children[1].className, 'vh');
  assertEqual(children[1].textContent, '：第27題');
});
