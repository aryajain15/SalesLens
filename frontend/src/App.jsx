import { useEffect, useState } from 'react';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [msg, setMsg] = useState('');
  const [summary, setSummary] = useState([]);
  const [rfm, setRfm] = useState([]);
  const [answer, setAnswer] = useState('');

  const call = async (path, opts = {}) => {
    const res = await fetch(path, { ...opts, headers: { ...(opts.json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
    const data = await res.json();
    if (res.status === 401) logout();
    if (!res.ok) throw new Error(data.error);
    return data;
  };
  const logout = () => { localStorage.removeItem('token'); setToken(null); };
  const load = async () => { try { setSummary(await call('/api/summary')); setRfm(await call('/api/rfm')); } catch (e) { setMsg(e.message); } };
  useEffect(() => { if (token) load(); }, [token]);

  const signIn = async (e, mode) => {
    e.preventDefault(); const f = new FormData(e.target.form || e.target);
    const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    localStorage.setItem('token', data.token); setToken(data.token); setMsg('');
  };
  const upload = async (e) => {
    const body = new FormData(); body.append('file', e.target.files[0]);
    try { const r = await call('/api/upload', { method: 'POST', body }); setMsg(`Imported ${r.inserted} orders. Skipped lines: ${r.rejectedLines.join(', ') || 'none'}`); load(); } catch (err) { setMsg(err.message); }
  };
  const ask = async (e) => {
    e.preventDefault(); setAnswer('Thinking…');
    try { setAnswer((await call('/api/insights', { method: 'POST', json: { question: new FormData(e.target).get('q') } })).answer); } catch (err) { setAnswer(err.message); }
  };

  if (!token) return (
    <main><h1>SalesLens</h1><section><h2>Sign in</h2>
      <form className="row"><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password (8+ characters)" required />
        <button onClick={(e) => signIn(e, 'login')}>Sign in</button><button type="button" onClick={(e) => signIn(e, 'register')}>Create account</button></form>
      <p className="err">{msg}</p></section></main>
  );

  const byMonth = Object.entries(summary.reduce((a, r) => ({ ...a, [r.month]: (a[r.month] || 0) + r.revenue }), {}));
  const max = Math.max(1, ...byMonth.map(([, v]) => v));
  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>SalesLens</h1><button onClick={logout}>Sign out</button></div>
      <section><h2>Import orders</h2><input type="file" accept=".csv" onChange={upload} aria-label="Orders CSV" />
        <p>Columns: customer_id, order_date, category, amount. {msg}</p></section>
      <section><h2>Revenue by month</h2>{byMonth.length ? byMonth.map(([m, v]) => <div className="bar" key={m}><span>{m}</span><i style={{ width: `${(v / max) * 100}%` }} /><span>{v.toLocaleString()}</span></div>) : <p>Import a CSV to see revenue.</p>}</section>
      <section><h2>Customer segments (RFM)</h2><div className="scroll"><table><thead><tr><th>Customer</th><th>Days since order</th><th>Orders</th><th>Spend</th><th>Segment</th></tr></thead>
        <tbody>{rfm.map((r) => <tr key={r.customer_id}><td>{r.customer_id}</td><td>{r.recency}</td><td>{r.frequency}</td><td>{r.monetary.toLocaleString()}</td><td>{r.segment}</td></tr>)}</tbody></table></div></section>
      <section><h2>Ask about your data</h2><form className="row" onSubmit={ask}><input name="q" placeholder="Which category grew fastest?" required /><button>Ask</button></form><p>{answer}</p></section>
    </main>
  );
}
