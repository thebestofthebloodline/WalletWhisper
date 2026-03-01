import React, { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'walletwhisper_window_position';
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 500;

interface FloatingWindowProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

interface Position {
  left: number;
  top: number;
}

function loadPosition(): Position {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const pos = JSON.parse(raw) as Position;
      return clampPosition(pos.left, pos.top);
    }
  } catch {
    // ignore
  }
  return clampPosition(window.innerWidth - WINDOW_WIDTH - 20, window.innerHeight - WINDOW_HEIGHT - 90);
}

function clampPosition(left: number, top: number): Position {
  return {
    left: Math.max(0, Math.min(left, window.innerWidth - WINDOW_WIDTH)),
    top: Math.max(0, Math.min(top, window.innerHeight - WINDOW_HEIGHT)),
  };
}

const FloatingWindow: React.FC<FloatingWindowProps> = ({ isOpen, onClose, children }) => {
  const [position, setPosition] = useState<Position>(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    }
  }, [position, isDragging]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((p) => clampPosition(p.left, p.top));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-close-btn]')) return;
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - (e.currentTarget.closest('[data-floating-window]') as HTMLElement).getBoundingClientRect().left,
      y: e.clientY - (e.currentTarget.closest('[data-floating-window]') as HTMLElement).getBoundingClientRect().top,
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newLeft = e.clientX - dragOffset.current.x;
      const newTop = e.clientY - dragOffset.current.y;
      setPosition(clampPosition(newLeft, newTop));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      data-floating-window
      style={{
        position: 'fixed',
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${WINDOW_WIDTH}px`,
        height: `${WINDOW_HEIGHT}px`,
        zIndex: 2147483645,
        borderRadius: '16px',
        overflow: 'hidden',
        // Glassmorphism: semi-transparent dark with blur
        background: 'rgba(12, 13, 20, 0.82)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        // Layered border: inner glow + outer subtle indigo
        border: '1px solid rgba(99, 102, 241, 0.12)',
        boxShadow: [
          '0 0 0 1px rgba(255, 255, 255, 0.04) inset',
          '0 1px 0 0 rgba(255, 255, 255, 0.06) inset',
          '0 24px 80px -12px rgba(0, 0, 0, 0.7)',
          '0 8px 24px -4px rgba(0, 0, 0, 0.5)',
          '0 0 40px -8px rgba(99, 102, 241, 0.08)',
        ].join(', '),
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#e2e8f0',
        fontSize: '14px',
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)',
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(255, 255, 255, 0.02)',
          flexShrink: 0,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Logo with subtle glow */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
                stroke="#818cf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #e2e8f0, #a5b4fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            WalletWhisper
          </span>
        </div>
        <button
          data-close-btn
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#64748b',
            cursor: 'pointer',
            padding: '5px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '8px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#e2e8f0';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
          }}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
};

export default FloatingWindow;
