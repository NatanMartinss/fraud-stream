import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FraudSim } from './fraud-sim.ts';

function run(params: Partial<FraudSim['params']>, seconds = 10) {
  const sim = new FraudSim();
  Object.assign(sim.params, params);
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60);
  return sim.metrics();
}

test('at 30% utilisation, p99 latency stays inside the 20 ms SLO', () => {
  const m = run({ tps: 3000, parallelism: 4 });
  assert.ok(m.utilization < 0.31);
  assert.ok(m.p99 < 20, `p99 = ${m.p99}`);
});

test('at 95% utilisation, p99 breaks the SLO long before the system is full', () => {
  const m = run({ tps: 9500, parallelism: 4 });
  assert.ok(m.p99 > 20, `p99 = ${m.p99}`);
});

test('adding parallelism brings latency back (the architecture fix)', () => {
  const m = run({ tps: 9500, parallelism: 8 });
  assert.ok(m.p99 < 20, `p99 = ${m.p99}`);
});

test('above capacity the backlog grows without bound', () => {
  const m = run({ tps: 12000, parallelism: 4 }, 5);
  assert.ok(m.backlog > 5000, `backlog = ${m.backlog}`);
});

test('lowering the threshold trades precision for recall', () => {
  const strict = run({ threshold: 0.8 }, 20);
  const loose = run({ threshold: 0.3 }, 20);
  assert.ok(loose.recall > strict.recall);
  assert.ok(loose.precision < strict.precision);
});

test('a card-testing attack is mostly caught once card velocity rises', () => {
  const sim = new FraudSim();
  sim.startAttack();
  let blocked = 0;
  let total = 0;
  for (let i = 0; i < 600; i++) for (const tx of sim.step(1 / 60)) (total++, tx.blocked && blocked++);
  assert.ok(total > 20);
  assert.ok(blocked / total > 0.6, `${blocked}/${total}`);
});
