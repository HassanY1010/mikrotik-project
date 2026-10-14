import React from 'react';
import {
  openWhatsApp,
  SUPPORT_PHONE_DISPLAY,
  WhatsAppOptions,
} from '../../core/utils/whatsapp';

interface WhatsAppButtonProps extends WhatsAppOptions {
  variant?: 'primary' | 'outline' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showNumber?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const WhatsAppIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = 'currentColor',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0 }}
  >
    <path
      d="M17.5 6.5C16.1 5.1 14.1 4.2 12 4.2C7.7 4.2 4.2 7.7 4.2 12C4.2 13.4 4.6 14.7 5.3 15.9L4 20L8.3 18.7C9.4 19.3 10.7 19.7 12 19.7C16.3 19.7 19.8 16.2 19.8 11.9C19.8 9.8 18.9 7.9 17.5 6.5Z"
      fill="#25D366"
    />
    <path
      d="M12 2C6.5 2 2 6.5 2 12C2 13.8 2.5 15.5 3.4 17L2 22L7.2 20.6C8.7 21.5 10.3 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20.3C10.5 20.3 9.1 19.9 7.8 19.1L7.5 18.9L4.4 19.7L5.3 16.7L5.1 16.4C4.2 15.1 3.7 13.6 3.7 12C3.7 7.4 7.4 3.7 12 3.7C16.6 3.7 20.3 7.4 20.3 12C20.3 16.6 16.6 20.3 12 20.3ZM16.6 14.5C16.3 14.4 15.1 13.8 14.9 13.7C14.7 13.6 14.5 13.6 14.4 13.8C14.2 14.1 13.8 14.6 13.6 14.7C13.5 14.9 13.3 14.9 13.1 14.8C12.8 14.6 12 14.4 11 13.5C10.2 12.8 9.7 12 9.5 11.7C9.4 11.5 9.5 11.3 9.6 11.2C9.7 11.1 9.8 10.9 10 10.8C10.1 10.6 10.2 10.5 10.2 10.4C10.3 10.2 10.3 10.1 10.2 10C10.1 9.9 9.7 8.8 9.5 8.3C9.3 7.8 9.1 7.9 9 7.9C8.9 7.9 8.7 7.9 8.5 7.9C8.3 7.9 8 8 7.8 8.2C7.5 8.5 7 9 7 10C7 11 7.8 12 7.9 12.1C8 12.3 9.5 14.6 11.8 15.6C13.7 16.4 14.1 16.2 14.5 16.2C15 16.1 16 15.6 16.2 15C16.4 14.4 16.4 14 16.3 13.9C16.2 13.7 16 13.7 15.8 13.6L16.6 14.5Z"
      fill={color === 'currentColor' ? 'white' : color}
    />
  </svg>
);

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  variant = 'primary',
  size = 'md',
  label,
  showNumber = true,
  type = 'subscription',
  planName,
  featureName,
  customMessage,
  style,
  className,
}) => {
  const defaultLabel =
    type === 'subscription' ? 'طلب الاشتراك عبر واتساب' : 'تواصل مع الدعم الفني';
  const buttonText = label || defaultLabel;

  const sizeStyles = {
    sm: { padding: '6px 12px', fontSize: '0.8rem', gap: '6px' },
    md: { padding: '9px 16px', fontSize: '0.875rem', gap: '8px' },
    lg: { padding: '12px 22px', fontSize: '0.95rem', gap: '10px' },
  }[size];

  const variantStyles: React.CSSProperties = {
    primary: {
      backgroundColor: '#16A34A',
      color: '#FFFFFF',
      border: '1px solid #22C55E',
      boxShadow: '0 2px 8px rgba(34, 197, 94, 0.25)',
    },
    outline: {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      color: '#4ADE80',
      border: '1px solid rgba(74, 222, 128, 0.4)',
    },
    subtle: {
      backgroundColor: 'transparent',
      color: '#4ADE80',
      border: 'none',
      padding: '4px 8px',
    },
  }[variant];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openWhatsApp({
      type,
      planName,
      featureName,
      customMessage,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '10px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textDecoration: 'none',
        lineHeight: 1.2,
        ...sizeStyles,
        ...variantStyles,
        ...style,
      }}
      title={`فتح محادثة واتساب (${SUPPORT_PHONE_DISPLAY})`}
    >
      <WhatsAppIcon size={size === 'lg' ? 20 : 17} color={variant === 'primary' ? 'white' : '#4ADE80'} />
      <span>{buttonText}</span>
      {showNumber && (
        <span
          style={{
            direction: 'ltr',
            fontSize: '0.75em',
            opacity: 0.9,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            padding: '2px 6px',
            borderRadius: '6px',
            fontWeight: 500,
            letterSpacing: '0.5px',
          }}
        >
          {SUPPORT_PHONE_DISPLAY}
        </span>
      )}
    </button>
  );
};
