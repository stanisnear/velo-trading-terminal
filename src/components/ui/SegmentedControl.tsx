import React from 'react';

/** Equal-width selection with one continuous glass indicator and native buttons. */
export function SegmentedControl({ label, options, value, onChange, compact = false }: {
  label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; compact?: boolean;
}) {
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  return <div role="group" aria-label={label} className={`velo-segments${compact ? ' velo-segments--compact' : ''}`}
    style={{ '--segment-count': options.length, '--segment-index': selected } as React.CSSProperties}>
    <span className="velo-segment-lens" aria-hidden="true"/>
    {options.map((option, index) => <button type="button" key={option.value} aria-pressed={option.value === value}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % options.length : event.key === 'ArrowLeft' ? (index + options.length - 1) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
        buttons?.[next]?.focus(); onChange(options[next].value);
      }}>{option.label}</button>)}
  </div>;
}
