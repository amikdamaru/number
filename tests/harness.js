// Minimal browser test harness (no dependencies).

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}

export async function run(logEl) {
  let pass = 0;
  let fail = 0;
  const lines = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      lines.push(`PASS  ${t.name}`);
    } catch (err) {
      fail++;
      lines.push(`FAIL  ${t.name}\n      ${err && err.message}`);
    }
  }
  lines.push('', `${pass} passed, ${fail} failed, ${pass + fail} total`);
  logEl.textContent = lines.join('\n');
  logEl.dataset.pass = String(pass);
  logEl.dataset.fail = String(fail);
  document.title = `${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`;
  return { pass, fail };
}
