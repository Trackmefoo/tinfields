"use client";

interface LightControlProps {
  disabled?: boolean;
  onToggle: () => void;
}

export function LightControl({ disabled, onToggle }: LightControlProps) {
  return (
    <button
      className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      Toggle Grow Lights
    </button>
  );
}
