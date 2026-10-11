import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  trend?: 'up' | 'down' | 'neutral' | 'alert';
  variant?: 'red' | 'amber' | 'emerald' | 'cyan' | 'slate';
  subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  change,
  trend = 'neutral',
  variant = 'slate',
  subtitle
}) => {
  const variantStyles = {
    red: {
      border: 'border-red-500/30 hover:border-red-500/60',
      bgGlow: 'bg-red-500/5',
      iconBg: 'bg-red-500/10 text-red-400 border border-red-500/30',
      accent: 'text-red-400',
      bar: 'bg-red-500'
    },
    amber: {
      border: 'border-amber-500/30 hover:border-amber-500/60',
      bgGlow: 'bg-amber-500/5',
      iconBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
      accent: 'text-amber-400',
      bar: 'bg-amber-500'
    },
    emerald: {
      border: 'border-emerald-500/30 hover:border-emerald-500/60',
      bgGlow: 'bg-emerald-500/5',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
      accent: 'text-emerald-400',
      bar: 'bg-emerald-500'
    },
    cyan: {
      border: 'border-cyan-500/30 hover:border-cyan-500/60',
      bgGlow: 'bg-cyan-500/5',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
      accent: 'text-cyan-400',
      bar: 'bg-cyan-500'
    },
    slate: {
      border: 'border-slate-800 hover:border-slate-700',
      bgGlow: 'bg-slate-900/50',
      iconBg: 'bg-slate-800 text-slate-300 border border-slate-700',
      accent: 'text-white',
      bar: 'bg-slate-600'
    }
  };

  const style = variantStyles[variant];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-slate-900/70 border ${style.border} ${style.bgGlow} p-5 backdrop-blur-md card-elevate group`}
    >
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${style.bar} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase font-mono tracking-wider text-slate-400">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
              {value}
            </span>
            {change && (
              <span
                className={`text-xs font-mono font-medium ${
                  trend === 'alert'
                    ? 'text-red-400'
                    : trend === 'up'
                    ? 'text-emerald-400'
                    : trend === 'down'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {change}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>

        <div className={`p-3 rounded-xl ${style.iconBg} shadow-inner`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
