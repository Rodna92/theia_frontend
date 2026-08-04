'use client';

import { AxisClip } from '../cadToPointCloud';

interface ClipAxisControlProps {
  axisLabel: string;
  minLabel: string;
  maxLabel: string;
  value: AxisClip;
  rangeMin: number;
  rangeMax: number;
  onChange: (next: AxisClip) => void;
}

export function ClipAxisControl({
  axisLabel,
  minLabel,
  maxLabel,
  value,
  rangeMin,
  rangeMax,
  onChange,
}: ClipAxisControlProps) {
  const step = (rangeMax - rangeMin) / 200 || 0.001;

  const handleMinChange = (raw: number) => onChange({ min: Math.min(raw, value.max), max: value.max });
  const handleMaxChange = (raw: number) => onChange({ min: value.min, max: Math.max(raw, value.min) });

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">{axisLabel}</p>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-500">{minLabel}</span>
          <input
            type="number"
            step="any"
            value={value.min}
            onChange={(e) => handleMinChange(Number(e.target.value))}
            className="w-20 py-1 px-2 rounded-md bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 text-right"
          />
        </div>
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={step}
          value={value.min}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-500">{maxLabel}</span>
          <input
            type="number"
            step="any"
            value={value.max}
            onChange={(e) => handleMaxChange(Number(e.target.value))}
            className="w-20 py-1 px-2 rounded-md bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 text-right"
          />
        </div>
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={step}
          value={value.max}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </div>
    </div>
  );
}
