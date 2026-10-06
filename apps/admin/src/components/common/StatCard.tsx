import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  trend?: string;
  trendPositive?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  iconBg = 'var(--primary-light)',
  trend,
  trendPositive = true,
}) => {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {trend && (
          <div
            style={{
              fontSize: '0.725rem',
              color: trendPositive ? 'var(--success)' : 'var(--danger)',
              marginTop: '0.2rem',
              fontWeight: 600,
            }}
          >
            {trend}
          </div>
        )}
      </div>
    </div>
  );
};
