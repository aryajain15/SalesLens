import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrders } from '../src/csv.js';

test('separates valid rows from bad ones with line numbers', () => {
  const csv = 'customer_id,order_date,category,amount\nC1,2026-01-05,Books,250\n,2026-01-06,Books,100\nC2,not-a-date,Toys,50\nC3,2026-02-01,Toys,-5\n';
  const { good, errors } = parseOrders(csv);
  assert.equal(good.length, 1);
  assert.equal(good[0].amount, 250);
  assert.deepEqual(errors, [3, 4, 5]);
});
