import { FileUp } from 'lucide-react';
import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useMoney } from '../lib/money';
import { useAccounts, useInvalidateMoney } from '../lib/queries';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Field } from './bits';

type DateFmt = 'auto' | 'ymd' | 'mdy' | 'dmy';
type Sign = 'negative-expense' | 'positive-expense';

const guess = (headers: string[], ...names: RegExp[]) =>
  headers.find((h) => names.some((n) => n.test(h.trim().toLowerCase()))) ?? '';

function parseDate(raw: string, fmt: DateFmt): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && (fmt === 'auto' || fmt === 'ymd')) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let [a, b] = [+m[1], +m[2]];
    if (fmt === 'dmy' || (fmt === 'auto' && a > 12)) [a, b] = [b, a];
    return iso(y, a, b);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA');
}
function iso(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const { data: accounts = [] } = useAccounts();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState({ date: '', amount: '', debit: '', credit: '', payee: '', category: '', note: '' });
  const [dateFmt, setDateFmt] = useState<DateFmt>('auto');
  const [sign, setSign] = useState<Sign>('negative-expense');
  const [accountId, setAccountId] = useState('');
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (file: File) => {
    setError('');
    if (file.size > 5_000_000) return setError('Choose a file smaller than 5 MB.');
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        if (!h.length || !res.data.length) return setError('This file has no rows. Choose a CSV with a header row.');
        setFileName(file.name);
        setHeaders(h);
        setRows(res.data);
        setMap({
          date: guess(h, /date/, /posted/, /time/),
          amount: guess(h, /^amount/, /amount$/, /^value$/, /^sum$/),
          debit: guess(h, /debit/, /withdraw/, /money out/, /paid out/),
          credit: guess(h, /credit/, /deposit/, /money in/, /paid in/),
          payee: guess(h, /payee/, /merchant/, /description/, /name/, /details/, /memo/),
          category: guess(h, /categor/),
          note: guess(h, /note/, /reference/),
        });
      },
      error: () => setError('This file couldn’t be read. Make sure it’s a CSV.'),
    });
  };

  const parsed = useMemo(() => {
    const out: { date: string; amount: number; payee: string; category: string; note: string }[] = [];
    let bad = 0;
    for (const r of rows) {
      const date = map.date ? parseDate(r[map.date] ?? '', dateFmt) : null;
      let amount: number | null = null;
      if (map.amount) {
        const v = money.parse(String(r[map.amount] ?? '').replace(/^\((.*)\)$/, '-$1'));
        const neg = /^\s*-|^\s*\(/.test(String(r[map.amount] ?? ''));
        if (v !== null) amount = (neg ? -Math.abs(v) : Math.abs(v)) * (sign === 'positive-expense' ? -1 : 1);
      } else if (map.debit || map.credit) {
        const d = money.parse(r[map.debit] ?? '') ?? 0;
        const c = money.parse(r[map.credit] ?? '') ?? 0;
        amount = Math.abs(c) - Math.abs(d);
      }
      if (!date || amount === null || amount === 0) { bad++; continue; }
      out.push({ date, amount, payee: (r[map.payee] ?? '').slice(0, 120), category: (r[map.category] ?? '').slice(0, 40), note: (r[map.note] ?? '').slice(0, 500) });
    }
    return { out, bad };
  }, [rows, map, dateFmt, sign, money]);

  const acct = accountId || accounts.find((a) => !a.archived)?.id || '';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ imported: number }>('/data/import', { method: 'POST', json: { accountId: acct, rows: parsed.out } });
      invalidate();
      toast(`Imported ${r.imported.toLocaleString()} transactions`);
      onClose();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const col = (key: keyof typeof map, label: string, optional = true) => (
    <Field label={label} htmlFor={`map-${key}`}>
      <select id={`map-${key}`} className="select" value={map[key]} onChange={(e) => setMap({ ...map, [key]: e.target.value })}>
        <option value="">{optional ? 'None' : 'Choose a column'}</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </Field>
  );

  return (
    <Sheet open onClose={onClose} title="Import CSV" wide locked={busy}
      action={rows.length ? (
        <button className="btn btn-plain bold" onClick={submit} disabled={busy || !parsed.out.length || !acct}>
          {busy ? <span className="spinner" /> : 'Import'}
        </button>
      ) : undefined}
    >
      <div className="stack">
        {!rows.length ? (
          <label className={`dropzone ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
            <span className="glyph lg" style={{ background: 'var(--accent)' }}><FileUp size={24} /></span>
            <span className="t-headline" style={{ color: 'var(--label)' }}>Drop a CSV file here</span>
            <span className="t-subhead">or <span style={{ color: 'var(--accent-text)' }}>choose a file</span> exported from your bank</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
          </label>
        ) : (
          <>
            <div className="row between">
              <span className="t-subhead"><b>{fileName}</b> · {rows.length.toLocaleString()} rows</span>
              <button className="btn btn-plain btn-sm" onClick={() => { setRows([]); setHeaders([]); }}>Choose Another</button>
            </div>
            <div className="grid grid-3">
              <Field label="Import into" htmlFor="imp-acct">
                <select id="imp-acct" className="select" value={acct} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              {col('date', 'Date column', false)}
              <Field label="Date format" htmlFor="imp-fmt">
                <select id="imp-fmt" className="select" value={dateFmt} onChange={(e) => setDateFmt(e.target.value as DateFmt)}>
                  <option value="auto">Detect automatically</option>
                  <option value="ymd">Year-Month-Day</option>
                  <option value="mdy">Month/Day/Year</option>
                  <option value="dmy">Day/Month/Year</option>
                </select>
              </Field>
              {col('amount', 'Amount column')}
              {!map.amount && col('debit', 'Money out column')}
              {!map.amount && col('credit', 'Money in column')}
              {map.amount && (
                <Field label="Expenses appear as" htmlFor="imp-sign">
                  <select id="imp-sign" className="select" value={sign} onChange={(e) => setSign(e.target.value as Sign)}>
                    <option value="negative-expense">Negative numbers</option>
                    <option value="positive-expense">Positive numbers</option>
                  </select>
                </Field>
              )}
              {col('payee', 'Payee / description')}
              {col('category', 'Category')}
              {col('note', 'Note')}
            </div>

            <div>
              <div className="row between" style={{ marginBottom: 'var(--space-2)' }}>
                <span className="t-headline">Preview</span>
                <span className="t-footnote secondary">
                  {parsed.out.length.toLocaleString()} ready{parsed.bad ? ` · ${parsed.bad} skipped (missing date or amount)` : ''}
                </span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Payee</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {parsed.out.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td className="num">{r.date}</td>
                        <td>{r.payee || <span className="secondary">—</span>}</td>
                        <td>{r.category || <span className="secondary">—</span>}</td>
                        <td className={`num ${r.amount > 0 ? 'income' : ''}`} style={{ textAlign: 'right' }}>{money(r.amount, { sign: r.amount > 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-footnote secondary mt-2">Categories that don’t exist yet are created automatically. You can recategorize in bulk afterward.</p>
            </div>
          </>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
