import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  trend?: React.ReactNode;
  trendPositive?: boolean;
  onClick?: () => void;
  clickableHint?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  iconBg = 'var(--primary-light)',
  trend,
  trendPositive = true,
  onClick,
  clickableHint,
}) => {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div className="stat-icon" style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
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
        {onClick && clickableHint && (
          <div
            style={{
              fontSize: '0.675rem',
              color: 'var(--primary)',
              marginTop: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontWeight: 500,
            }}
          >
            <span>{clickableHint}</span>
            <span>&larr;</span>
          </div>
        )}
      </div>
    </div>
  );
};
