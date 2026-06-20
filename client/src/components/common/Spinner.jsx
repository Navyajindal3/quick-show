import React from 'react';
import { Film } from 'lucide-react';

export default function Spinner({ size = 40, text = 'Loading...' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 40, minHeight: 200,
    }}>
      <div style={{
        width: size, height: size,
        border: `3px solid rgba(229, 9, 20, 0.2)`,
        borderTop: `3px solid #e50914`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      {text && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{text}</p>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 200,
    }}>
      <div style={{
        width: 60, height: 60,
        background: 'linear-gradient(135deg, #e50914, #b81d24)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <Film size={30} color="white" />
      </div>
      <div style={{
        width: 48, height: 48,
        border: `3px solid rgba(229, 9, 20, 0.2)`,
        borderTop: `3px solid #e50914`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(0.95); } }
      `}</style>
    </div>
  );
}
