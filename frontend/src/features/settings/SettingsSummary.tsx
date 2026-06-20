import type { LucideIcon } from 'lucide-react';

type SettingsSummaryItemProps = {
  icon: LucideIcon;
  label: string;
  value: number;
};

export function SettingsSummaryItem({ icon: Icon, label, value }: SettingsSummaryItemProps) {
  return (
    <div className="summary-item">
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
