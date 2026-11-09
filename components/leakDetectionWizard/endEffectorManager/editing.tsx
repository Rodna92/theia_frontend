'use client';

import { useEffect, useState } from 'react';
import { parseDocument } from 'yaml';
import { type Dict } from './geometry';

// Returns a copy of `obj` with the value at "a.b.c" replaced (the input is never mutated).
export function setIn(obj: Dict, key: string, value: unknown): Dict {
  const [head, ...rest] = key.split('.');
  const child = obj[head];
  return {
    ...obj,
    [head]: rest.length ? setIn((child && typeof child === 'object' ? child : {}) as Dict, rest.join('.'), value) : value,
  };
}

export function getIn(obj: Dict, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Dict)[k] : undefined), obj);
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The file text with the edited values written in, keeping its comments and layout.
// Only for display: nothing is sent back to the backend.
export function applyEditsToYaml(raw: string, changes: { key: string; value: unknown }[]): string {
  if (changes.length === 0) return raw;
  const doc = parseDocument(raw);
  const js = doc.toJS() as Dict | null;
  const nodeKey = js ? Object.keys(js).find((k) => (js[k] as Dict | null)?.ros__parameters) : undefined;
  const base = nodeKey ? [nodeKey, 'ros__parameters'] : [];
  for (const { key, value } of changes) {
    const node = Array.isArray(value) ? doc.createNode(value, { flow: true }) : value;
    doc.setIn([...base, ...key.split('.')], node);
  }
  return doc.toString();
}

const inputCls =
  'px-1.5 py-0.5 rounded border bg-white dark:bg-slate-950 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500';

// Number input that keeps the typed text ("-", "0.") while it is not a valid number yet.
export function NumberField({ value, onChange, className = 'w-24' }: { value: number; onChange: (v: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    // Follow outside changes (discard, reload) but not our own partial typing.
    setDraft((d) => (Number(d) === value && d.trim() !== '' ? d : String(value)));
  }, [value]);
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft));
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => !valid && setDraft(String(value))}
      className={`${inputCls} ${className} tabular-nums text-cyan-700 dark:text-cyan-300 ${
        valid ? 'border-slate-300 dark:border-white/15' : 'border-red-500'
      }`}
    />
  );
}

export function TextField({ value, onChange, className = 'w-40' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${className} border-slate-300 dark:border-white/15 text-amber-700 dark:text-amber-300`}
    />
  );
}

// Editor for one parameter value; arrays keep their length, each element edited in place.
export function ValueEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (typeof value === 'number') return <NumberField value={value} onChange={onChange} />;
  if (typeof value === 'string') return <TextField value={value} onChange={onChange} />;
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-cyan-500" />;
  }
  if (Array.isArray(value)) {
    const set = (i: number, v: unknown) => onChange(value.map((x, k) => (k === i ? v : x)));
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {value.map((v, i) =>
          typeof v === 'number' ? (
            <NumberField key={i} value={v} onChange={(n) => set(i, n)} className="w-14" />
          ) : typeof v === 'string' ? (
            <TextField key={i} value={v} onChange={(s) => set(i, s)} className="w-28" />
          ) : (
            <span key={i} className="text-slate-400">{JSON.stringify(v)}</span>
          )
        )}
      </span>
    );
  }
  return <span className="text-slate-400 italic">null</span>;
}
