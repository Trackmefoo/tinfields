"use client";

interface IrrigationPanelProps {
  disabled?: boolean;
  onStartZoneA: () => void;
}

export function IrrigationPanel({ disabled, onStartZoneA }: IrrigationPanelProps) {
  return (
    <button
      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
      disabled={disabled}
      onClick={onStartZoneA}
      type="button"
    >
      Start Irrigation (Zone A)
    </button>
  );
}
