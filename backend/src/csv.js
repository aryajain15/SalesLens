import { parse } from 'csv-parse/sync';
// Expects columns: customer_id, order_date, category, amount. Returns valid rows and 1-based CSV line numbers of bad rows.
export function parseOrders(buf) {
  const rows = parse(buf, { columns: true, skip_empty_lines: true, trim: true });
  const good = [], errors = [];
  rows.forEach((r, i) => {
    const amount = Number(r.amount);
    if (!r.customer_id || !r.category || Number.isNaN(Date.parse(r.order_date)) || !(amount > 0)) errors.push(i + 2);
    else good.push({ ...r, amount });
  });
  return { good, errors };
}
