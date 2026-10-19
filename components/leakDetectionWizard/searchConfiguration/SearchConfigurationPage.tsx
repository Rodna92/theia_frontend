'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { IconChevronLeft, IconDeviceFloppy, IconX } from '@tabler/icons-react';

// Upper bound of the point depth (z) coordinate, in cm.
const Z_MAX_CM = 80;

const card =
  'rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5';

export function SearchConfigurationPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [mode, setMode] = useState<'points' | 'quadrants' | 'none'>('points');
  const [points, setPoints] = useState([{ x: 0, y: 0, z: 0 }]);
  const [levels, setLevels] = useState(2);
  const [divisions, setDivisions] = useState(2);
  const [selectedQuadrants, setSelectedQuadrants] = useState<number[]>([]);

  useEffect(() => {
    setSelectedQuadrants([]);
  }, [levels, divisions]);

  const addPoint = () => {
    if (points.length < 4) {
      setPoints([...points, { x: 0, y: 0, z: 0 }]);
    }
  };

  const removePoint = (index: number) => {
    if (points.length > 1) {
      setPoints(points.filter((_, i) => i !== index));
    }
  };

  const updatePoint = (index: number, axis: 'x' | 'y' | 'z', value: number) => {
    const newPoints = [...points];
    const min = axis === 'z' ? 0 : -40;
    const max = axis === 'z' ? Z_MAX_CM : 40;
    const clampedValue = Math.min(max, Math.max(min, value));
    newPoints[index] = { ...newPoints[index], [axis]: clampedValue };
    setPoints(newPoints);
  };

  return (
    <div>
      <main className="max-w-7xl 3xl:max-w-[1600px] mx-auto px-4 py-4 xs:py-6 phone-short:py-4 sm:px-6 sm:py-8 lg:px-8 3xl:py-10">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 xs:mb-6 phone-short:mb-4 3xl:mb-8">
          <Link
            href={`/${locale}/process/leak-detection`}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('leakDetection.configure.back')}
          >
            <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-base xs:text-lg 3xl:text-xl font-semibold text-slate-900 dark:text-slate-100">
              {t('leakDetection.configure.process.searchingSetup.title')}
            </h1>
            <p className="text-xs 3xl:text-sm text-slate-500">
              {t('leakDetection.configure.process.searchingSetup.description')}
            </p>
          </div>
        </div>

        <div className={`overflow-hidden p-4 xs:p-5 sm:p-6 3xl:p-8 flex flex-col gap-4 xs:gap-6 phone-short:gap-4 lg:grid lg:grid-cols-5 lg:items-center lg:gap-8 3xl:gap-12 ${card}`}>
          <div className="lg:col-span-2 flex flex-col items-center gap-5 xs:gap-6 sm:gap-8 p-0 sm:p-4 rounded-xl">
            <div className="flex flex-col items-center gap-2">
              <label className="text-xs xs:text-sm 3xl:text-base font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                Searching Mode
              </label>
              <div className="flex p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg w-fit">
                <button
                  onClick={() => setMode('none')}
                  className={`px-3 xs:px-4 3xl:px-5 py-1.5 rounded-md text-xs 3xl:text-sm font-semibold transition-all ${
                    mode === 'none'
                      ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  None
                </button>
                <button
                  onClick={() => setMode('points')}
                  className={`px-3 xs:px-4 3xl:px-5 py-1.5 rounded-md text-xs 3xl:text-sm font-semibold transition-all ${
                    mode === 'points'
                      ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Points
                </button>
                <button
                  onClick={() => setMode('quadrants')}
                  className={`px-3 xs:px-4 3xl:px-5 py-1.5 rounded-md text-xs 3xl:text-sm font-semibold transition-all ${
                    mode === 'quadrants'
                      ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Quadrants
                </button>
              </div>
            </div>

            {mode === 'points' && (
              <div className="w-full flex flex-col gap-4">
                <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                  {points.map((point, index) => (
                    <div key={index} className="flex flex-col gap-2 p-3 3xl:p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-cyan-500/40 dark:border-cyan-400/30 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/10 relative group">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] 3xl:text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-widest">
                          Point {index + 1}
                        </span>
                        {points.length > 1 && (
                          <button
                            onClick={() => removePoint(index)}
                            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Remove point"
                          >
                            <IconX size={12} />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {(['x', 'y', 'z'] as const).map((axis) => (
                          <div key={axis} className="flex flex-col gap-1">
                            <label className="text-[10px] 3xl:text-xs font-bold text-slate-600 dark:text-slate-300">
                              <span className="uppercase">{axis}</span>{' '}
                              <span className="font-medium text-slate-400 dark:text-slate-500">(cm)</span>
                            </label>
                            <input
                              type="number"
                              value={point[axis]}
                              onChange={(e) => updatePoint(index, axis, parseFloat(e.target.value) || 0)}
                              className="w-14 xs:w-16 3xl:w-20 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-white/20 text-xs 3xl:text-sm font-semibold focus:ring-1 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
                              min={axis === 'z' ? 0 : -40}
                              max={axis === 'z' ? Z_MAX_CM : 40}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {points.length < 4 && (
                    <button
                      onClick={addPoint}
                      className="self-stretch min-h-[68px] px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-400 hover:border-cyan-500/50 hover:text-cyan-500 transition-all flex flex-col items-center justify-center gap-1"
                    >
                      <span className="text-xl font-light">+</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest">Add Point</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'quadrants' && (
              <div className="flex flex-col xs:flex-row items-center gap-3 xs:gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Levels
                  </label>
                  <input
                    type="number"
                    value={levels}
                    onChange={(e) => setLevels(Math.min(4, parseInt(e.target.value) || 1))}
                    className="w-16 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
                    min="1"
                    max="4"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Divisions
                  </label>
                  <input
                    type="number"
                    value={divisions}
                    onChange={(e) => setDivisions(Math.min(4, parseInt(e.target.value) || 1))}
                    className="w-16 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
                    min="1"
                    max="4"
                  />
                </div>
              </div>
            )}

            {mode !== 'none' && (
              // Placeholder: persistence of the search setup is not implemented yet.
              <button
                type="button"
                onClick={() => undefined}
                className="inline-flex items-center gap-2 px-5 py-2 3xl:px-6 3xl:py-2.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm 3xl:text-base font-medium"
              >
                <IconDeviceFloppy size={18} />
                {t('leakDetection.configure.save')}
              </button>
            )}
          </div>

          <div className="lg:col-span-3 relative w-[85%] phone-short:w-2/3 sm:w-1/2 lg:w-3/5 max-w-[22rem] 2xl:max-w-md 3xl:max-w-lg mx-auto my-6 sm:my-10 lg:my-16 3xl:my-20 [perspective:1200px]">
            {mode === 'quadrants' && (
              <div
                className="absolute inset-0 grid transition-all duration-500 z-20"
                style={{
                  gridTemplateRows: `repeat(${levels}, 1fr)`,
                  gridTemplateColumns: `repeat(${divisions}, 1fr)`,
                  transform: 'perspective(1200px) rotateZ(8deg) rotateY(-40deg) rotateX(-15deg) translateX(21%) translateY(-12%) scaleX(1.5) scaleY(0.8)',
                  transformOrigin: 'center',
                }}
              >
                {Array.from({ length: levels * divisions }).map((_, i) => {
                  const selectedIndex = selectedQuadrants.indexOf(i);
                  const isSelected = selectedIndex !== -1;
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedQuadrants(selectedQuadrants.filter(id => id !== i));
                        } else {
                          setSelectedQuadrants([...selectedQuadrants, i]);
                        }
                      }}
                      className={`border transition-all flex items-center justify-center cursor-pointer
                        ${isSelected
                          ? 'border-cyan-500 dark:border-cyan-400 bg-cyan-500/10 dark:bg-cyan-400/20 border-2'
                          : 'border-[0.5px] border-cyan-500/30 dark:border-cyan-400/20 hover:bg-cyan-500/5'}`}
                    >
                      {isSelected && (
                        <span className="text-sm xs:text-base sm:text-lg font-bold text-cyan-600 dark:text-cyan-400">
                          {selectedIndex + 1}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {mode === 'points' && (
              <div
                className="absolute inset-0 pointer-events-none transition-all duration-500 z-20"
                style={{
                  transform: 'perspective(1200px) rotateZ(8deg) rotateY(-40deg) rotateX(-15deg) translateX(20%) translateY(-10%) scaleX(1.5) scaleY(0.8)',
                  transformOrigin: 'center',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* 2x2 Grid Background */}
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="border-[1px] border-gray-500/30 dark:border-gray-400/20"
                    />
                  ))}
                </div>

                {/* Points and depth lines */}
                {points.map((point, i) => {
                  const xPercent = ((point.x + 40) / 80) * 100;
                  const yPercent = ((40 - point.y) / 80) * 100;
                  const zHeight = (point.z / Z_MAX_CM) * 180; // Max 180px depth

                  // Distance to axes in percentage
                  const axisX = 50; // vertical axis at x=50%
                  const axisY = 50; // horizontal axis at y=50%

                  const hLeft = Math.min(xPercent, axisX);
                  const hWidth = Math.abs(axisX - xPercent);

                  const vTop = Math.min(yPercent, axisY);
                  const vHeight = Math.abs(axisY - yPercent);

                  return (
                    <div
                      key={i}
                      className="absolute inset-0 pointer-events-none"
                      style={{ transformStyle: 'preserve-3d' }}>
                      {/* Axis connections */}
                      {/* Horizontal line to Y-axis */}
                      <div
                        className="absolute border-t border-dashed border-cyan-500/20"
                        style={{
                          top: `${yPercent}%`,
                          left: `${hLeft}%`,
                          width: `${hWidth}%`,
                          transform: "translateY(-50%)",
                        }}
                      />
                      {/* Vertical line to X-axis */}
                      <div
                        className="absolute border-l border-dashed border-cyan-500/20"
                        style={{
                          left: `${xPercent}%`,
                          top: `${vTop}%`,
                          height: `${vHeight}%`,
                          transform: "translateX(-50%)",
                        }}
                      />

                      {/* The Point (on the plane) */}
                      <div
                        className="absolute w-1 h-1 -ml-[3px] -mt-[3px] bg-slate-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                        style={{
                          left: `${xPercent}%`,
                          top: `${yPercent}%`,
                        }}
                      />
                      {/* The Line to "depth" */}
                      <div
                        className="absolute w-[1px] bg-gradient-to-b from-cyan-500 to-transparent"
                        style={{
                          left: `${xPercent}%`,
                          top: `${yPercent}%`,
                          height: `${zHeight}px`,
                          transform: "translate(-50%, 0) rotateX(-90deg)",
                          transformOrigin: "top center",
                          transformStyle: "preserve-3d",
                        }}
                      >
                        {/* The End Point (at depth) */}
                        <div
                          className="absolute bottom-0 left-1/2 -ml-[3px] -mb-[3px] w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                          style={{ transform: "rotateX(90deg)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Image
              src="/images/FTmachineGeneric-001.png"
              alt="Searching Setup"
              width={200}
              height={150}
              className="w-full h-auto object-cover relative z-10 transition-all duration-500"
              style={{
                opacity: mode === 'quadrants' ? 0.4
                       : mode === 'points' ? 0.4
                       : 1,
                transform: mode === 'quadrants' ? 'rotateY(-20deg) translateX(-20%) translateY(13%)'
                         : mode === 'points' ? 'rotateY(-20deg) translateX(-22%) translateY(15%)'
                         : 'rotateY(-20deg) translateX(0%) translateY(0%)'
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
