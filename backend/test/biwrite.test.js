const test = require('node:test');
const assert = require('node:assert');
const env = require('../src/config/environment');
const svc = require('../src/services/biWriteService');

env.writeback = { maxAmount: 50000, maxHourlyRate: 5000, monthsBack: 1 };

test('only this month and last month are editable', () => {
  assert.doesNotThrow(() => svc.assertMonthEditable('2026-10', '2026-10'));
  assert.doesNotThrow(() => svc.assertMonthEditable('2026-09', '2026-10'));
  assert.throws(() => svc.assertMonthEditable('2026-08', '2026-10'), /locked/);
  assert.throws(() => svc.assertMonthEditable('2026-11', '2026-10'), /future/);
  assert.throws(() => svc.assertMonthEditable('Oct', '2026-10'), /look like/);
});

test('an actor is always required and is labelled as Power BI', () => {
  assert.throws(() => svc.actorOf(''), /actor/);
  assert.strictEqual(svc.actorOf('jane@corp.com').name, 'Power BI · jane@corp.com');
});

test('bad input is rejected before touching the database', async () => {
  await assert.rejects(svc.adjustment({ employeeId: 'E1', month: '2026-10', type: 'gift', amount: 5, reason: 'x', actor: 'a@b.com' }), /bonus/);
  await assert.rejects(svc.adjustment({ employeeId: 'E1', month: '2026-10', type: 'bonus', amount: 999999, reason: 'x', actor: 'a@b.com' }), /limit/);
  await assert.rejects(svc.adjustment({ employeeId: 'E1', month: '2026-10', type: 'bonus', amount: 100, reason: '', actor: 'a@b.com' }), /reason/);
  await assert.rejects(svc.hourlyRate({ employeeId: 'E1', hourlyRate: 99999, reason: 'x', actor: 'a@b.com' }), /limit/);
  await assert.rejects(svc.penalty({ employeeId: 'E1', date: '2026-10-01', action: 'waive', reason: '', actor: 'a@b.com' }), /reason/);
});
