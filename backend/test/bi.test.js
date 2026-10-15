const test = require('node:test');
const assert = require('node:assert');

test('CSV escapes commas, quotes and newlines', () => {
  const { toCsv } = require('../src/services/biService');
  const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2', d: 5 }]);
  assert.strictEqual(csv, 'a,b,c,d\n"x,y","say ""hi""","l1\nl2",5');
});

test('API key middleware: off, wrong, right', () => {
  const env = require('../src/config/environment');
  const mw = require('../src/middleware/apiKeyMiddleware');
  const run = (headers) => {
    let out = { next: false };
    const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
    mw({ headers, query: {} }, res, () => { out.next = true; });
    return out;
  };
  env.reportingApiKey = '';
  assert.strictEqual(run({ 'x-api-key': 'abc' }).status, 503);
  env.reportingApiKey = 'secret123';
  assert.strictEqual(run({}).status, 401);
  assert.strictEqual(run({ 'x-api-key': 'nope' }).status, 401);
  assert.strictEqual(run({ 'x-api-key': 'secret123' }).next, true);
});
