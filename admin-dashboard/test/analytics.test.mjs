import { describe, pivot, applyFilters, aggregate, outliers, correlationMatrix, numericColumns, toCsvText } from '../src/lib/analytics.js';
import { buildInsights } from '../src/lib/insights.js';
import assert from 'node:assert';
const rows = [
 { 'Employee ID':'E1', Department:'Ops', Month:'2026-10', Net: 100, Hours: 10 },
 { 'Employee ID':'E2', Department:'Ops', Month:'2026-10', Net: 200, Hours: 20 },
 { 'Employee ID':'E3', Department:'HR', Month:'2026-10', Net: 300, Hours: 30 },
 { 'Employee ID':'E4', Department:'HR', Month:'2026-10', Net: '', Hours: 40 },
];
assert.deepStrictEqual(numericColumns(rows), ['Net','Hours']);
const d = describe(rows);
assert.strictEqual(d.numeric[0].count, 3); assert.strictEqual(d.numeric[0].mean, 200); assert.strictEqual(d.missing.find(m=>m.column==='Net').missing, 1);
assert.deepStrictEqual(pivot(rows,{rowBy:'Department',measure:'Net',agg:'sum'}).data, [{key:'HR',value:300},{key:'Ops',value:300}]);
assert.strictEqual(pivot(rows,{rowBy:'Department',colBy:'Month',measure:'Hours',agg:'mean'}).data[0]['2026-10'], 35);
assert.strictEqual(applyFilters(rows,[{column:'Net',op:'>=',value:'200'}]).length, 2);
assert.strictEqual(applyFilters(rows,[{column:'Department',op:'contains',value:'op'}]).length, 2);
assert.strictEqual(applyFilters(rows,[{column:'Net',op:'empty',value:''}]).length, 1);
assert.strictEqual(aggregate([1,2,3,10],'median'), 2.5);
const c = correlationMatrix(rows.slice(0,3), ['Net','Hours']); assert.ok(Math.abs(c[0][1]-1)<1e-9);
assert.strictEqual(toCsvText([{a:'x,y',b:1}]), 'a,b\n"x,y",1');
const ins = buildInsights({ daily:[{weekday:'Mon',late:3,latePct:30},{weekday:'Tue',late:0,latePct:0}], attendance:[], payroll:[],
  scorecard:[{name:'A',department:'Ops',lateCount:4,latePct:40,avgMinutesLate:20,penaltyCharged:400,daysPresent:10,daysAbsent:1,missingCheckouts:2,avgHoursPerDay:6,totalHours:60,overtimeHours:0}] });
assert.ok(ins.find(i=>i.id==='late')); assert.ok(ins.find(i=>i.id==='missing')); assert.ok(ins.find(i=>i.id==='weekday')); assert.ok(ins.find(i=>i.id==='under'));
console.log('ANALYTICS LIB OK');
