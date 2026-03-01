import React from 'react';

/**
 * WalletIcon component — a small chat bubble icon displayed inline
 * next to detected wallet addresses in the page DOM.
 *
 * This component is used as a reference for the DOM scanner's injected icons.
 * The actual injection happens in dom-scanner.ts using raw DOM manipulation
 * (outside React) for performance. This component can be used if rendering
 * via React portals is needed in the future.
 */

interface WalletIconProps {
  address: string;
  onClick: (address: string) => void;
}

const WalletIcon: React.FC<WalletIconProps> = ({ address, onClick }) => {
  return (
    <span
      title={`Chat with ${address} on WalletWhisper`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(address);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        marginLeft: '4px',
        cursor: 'pointer',
        verticalAlign: 'middle',
        borderRadius: '4px',
        background: 'rgba(99, 102, 241, 0.15)',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default WalletIcon;
