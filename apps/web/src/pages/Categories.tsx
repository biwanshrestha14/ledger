import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_ICONS, CategoryIcon, Glyph } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ColorPicker, Field, ListSkeleton, PageHeader, Switch } from '../components/bits';
import { api } from '../lib/api';
import { useCategories, useInvalidateMoney } from '../lib/queries';
import type { Category } from '../lib/types';

export default function Categories() {
  const { data: categories, isLoading } = useCategories();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const list = (categories ?? []).filter((c) => c.kind === kind);

  return (
    <div className="page">
      <PageHeader title="Categories" subtitle="Organize how money comes and goes">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={16} /> New Category</button>
      </PageHeader>
      <div style={{ maxWidth: 320, marginBottom: 'var(--space-4)' }}>
        <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
      </div>
      {isLoading ? <ListSkeleton rows={8} /> : (
        <div className="list">
          {list.map((c) => (
            <button key={c.id} className="list-row" onClick={() => setEditing(c)} style={{ opacity: c.archived ? 0.55 : 1 }}>
              <Glyph icon={c.icon} color={c.color} />
              <span className="grow row-title">{c.name}</span>
              {c.archived && <span className="badge">Archived</span>}
              <ChevronRight size={16} className="row-chevron" />
            </button>
          ))}
        </div>
      )}
      {editing && <CategorySheet category={editing === 'new' ? undefined : editing} kind={kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategorySheet({ category, kind, onClose }: { category?: Category; kind: 'expense' | 'income'; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? '#0088ff');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [archived, setArchived] = useState(category?.archived ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError('Enter a category name.');
    setBusy(true);
    try {
      if (category) await api(`/categories/${category.id}`, { method: 'PATCH', json: { name: name.trim(), color, icon, archived } });
      else await api('/categories', { method: 'POST', json: { name: name.trim(), color, icon, kind } });
      invalidate();
      toast(category ? 'Category updated' : 'Category created');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    await api(`/categories/${category!.id}`, { method: 'DELETE' });
    invalidate();
    toast('Category deleted');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={category ? 'Edit Category' : `New ${kind === 'income' ? 'Income' : 'Expense'} Category`} locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : 'Save'}</button>}
      footer={category ? <button className="btn btn-destructive btn-block" onClick={() => setConfirm(true)}>Delete Category</button> : undefined}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row" style={{ justifyContent: 'center' }}><Glyph icon={icon} color={color} size="lg" /></div>
        <Field label="Name" htmlFor="c-name"><input id="c-name" data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
        <div className="field"><span className="field-label">Color</span><ColorPicker value={color} onChange={setColor} /></div>
        <div className="field"><span className="field-label">Icon</span>
          <div className="icon-grid" role="radiogroup" aria-label="Icon">
            {Object.keys(CATEGORY_ICONS).filter((k) => k !== 'circle-help').map((k) => (
              <button type="button" key={k} className="icon-choice" aria-pressed={k === icon} aria-label={k.replace(/-/g, ' ')} onClick={() => setIcon(k)}><CategoryIcon name={k} size={20} /></button>
            ))}
          </div>
        </div>
        {category && (
          <div className="row between">
            <div><div className="t-subhead">Archive</div><div className="t-footnote secondary">Hide from pickers. Past transactions keep it.</div></div>
            <Switch checked={archived} onChange={setArchived} label="Archive category" />
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
      <Alert open={confirm} title={`Delete “${category?.name}”?`} message="Transactions in this category become uncategorized, and its budget is removed." confirmLabel="Delete" destructive busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Sheet>
  );
}
