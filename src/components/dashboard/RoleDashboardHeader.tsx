interface RoleDashboardHeaderProps {
  title: string;
  subtitle: string;
}

export function RoleDashboardHeader({ title, subtitle }: RoleDashboardHeaderProps) {
  return (
    <div className="space-y-1">
      <h1 className="text-3xl font-bold tracking-tight text-text-primary">
        {title}
      </h1>
      <p className="text-sm text-text-secondary">{subtitle}</p>
    </div>
  );
}
