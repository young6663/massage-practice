// 極簡測試框架，不依賴任何套件，在瀏覽器執行（tests/unit.html）。
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || '斷言失敗');
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message ? message + '：' : ''}預期 ${e}，實際 ${a}`);
  }
}

export async function run(containerId = 'results') {
  const container = document.getElementById(containerId);
  let pass = 0;
  let fail = 0;
  const rows = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass += 1;
      rows.push({ name: t.name, ok: true });
    } catch (e) {
      fail += 1;
      rows.push({ name: t.name, ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
  if (container) {
    container.textContent = '';
    const summary = document.createElement('p');
    summary.id = 'summary';
    summary.textContent = `共 ${tests.length} 項，通過 ${pass}，失敗 ${fail}`;
    container.appendChild(summary);
    const ul = document.createElement('ul');
    for (const r of rows) {
      const li = document.createElement('li');
      li.textContent = r.ok ? `PASS - ${r.name}` : `FAIL - ${r.name}：${r.error}`;
      li.style.color = r.ok ? '#1d5a2c' : '#a3161a';
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
  document.title = fail === 0 ? `PASS ${pass}` : `FAIL ${fail}`;
  return { pass, fail, total: tests.length };
}
