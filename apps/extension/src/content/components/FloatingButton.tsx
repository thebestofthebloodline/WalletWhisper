import React from 'react';

interface FloatingButtonProps {
  unreadCount: number;
  isOpen: boolean;
  onClick: () => void;
}

const FloatingButton: React.FC<FloatingButtonProps> = ({ unreadCount, isOpen, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: isOpen
          ? 'linear-gradient(135deg, #818cf8, #6366f1)'
          : 'linear-gradient(135deg, #6366f1, #4f46e5)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
        transform: isOpen ? 'scale(0.9)' : 'scale(1)',
        zIndex: 2147483646,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!isOpen) {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(99, 102, 241, 0.5)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.4)';
      }}
      aria-label={isOpen ? 'Close WalletWhisper' : 'Open WalletWhisper'}
    >
      {/* Chat bubble icon */}
      {isOpen ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Unread badge */}
      {unreadCount > 0 && !isOpen && (
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: 'white',
            fontSize: '11px',
            fontWeight: 700,
            borderRadius: '10px',
            minWidth: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: '2px solid #0f1117',
            lineHeight: 1,
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default FloatingButton;
