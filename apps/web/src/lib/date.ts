export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const currentMonth = () => todayISO().slice(0, 7);

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthBounds = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, days: last };
};

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d ?? 1);
};

export const formatMonth = (month: string, locale?: string, short = false) =>
  parse(month).toLocaleDateString(locale, { month: short ? 'short' : 'long', year: short ? undefined : 'numeric' });

export function formatDay(iso: string, locale?: string) {
  const today = todayISO();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (iso === today) return 'Today';
  if (iso === y) return 'Yesterday';
  const d = parse(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

export const formatShortDate = (iso: string, locale?: string) =>
  parse(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

export function daysUntil(iso: string) {
  const ms = parse(iso).getTime() - parse(todayISO()).getTime();
  return Math.round(ms / 86400000);
}

export function relativeDue(iso: string) {
  const n = daysUntil(iso);
  if (n < 0) return n === -1 ? 'Overdue by 1 day' : `Overdue by ${-n} days`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return n < 14 ? `Due in ${n} days` : `Due ${formatShortDate(iso)}`;
}
