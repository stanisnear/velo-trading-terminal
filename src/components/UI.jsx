import { useState, useEffect } from "react";
import { fmt, calcPnl } from "../utils/helpers.jsx";

// ─── TOAST ──────────────────────────────────────────────────────────────
export function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const bg = type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6";
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: bg, color: "#fff", padding: "10px 24px", borderRadius: 20,
      fontWeight: 700, fontSize: 13, boxShadow: `0 8px 32px ${bg}44`,
      animation: "toastIn 0.3s ease", display: "flex", alignItems: "center", gap: 8,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"} {msg}
    </div>
  );
}

// ─── LOGIN MODAL ────────────────────────────────────────────────────────
export function LoginModal({ open, onClose, onLogin }) {
  const [name, setName] = useState("");
  if (!open) return null;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, color: "#e5e5e5" }}>Welcome to VELO</div>
            <div style={{ fontSize: 12, color: "#666" }}>Start with $10,000 demo balance</div>
          </div>
        </div>
        <input autoFocus placeholder="Username" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onLogin(name.trim())}
          style={{ ...S.input, marginTop: 18, marginBottom: 14, fontSize: 15, padding: "13px 16px" }} />
        <button onClick={() => name.trim() && onLogin(name.trim())}
          disabled={!name.trim()}
          style={{ ...S.btn, width: "100%", padding: "13px 0", fontSize: 14, opacity: name.trim() ? 1 : 0.35 }}>
          Start Trading
        </button>
      </div>
    </div>
  );
}

// ─── HEADER ─────────────────────────────────────────────────────────────
export function Header({ user, status, theme, onToggleTheme, onLogin, totalEquity }) {
  return (
    <header style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        </div>
        <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -1, color: "#e5e5e5" }}>VELO</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "2px 7px", borderRadius: 4, letterSpacing: 0.8, marginLeft: -4 }}>PROTOTYPE</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
          color: status === "live" ? "#10b981" : "#f59e0b",
          background: status === "live" ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: status === "live" ? "#10b981" : "#f59e0b", animation: "pulse 2s infinite" }} />
          {status === "live" ? "LIVE DATA" : status === "simulated" ? "SIMULATED" : "CONNECTING"}
        </div>
        {/* Theme toggle */}
        <button onClick={onToggleTheme} style={S.iconBtn}>
          {theme === "dark" ? (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          ) : (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e5e5e5" }}>{user.username}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", fontFamily: "monospace" }}>${fmt(totalEquity)}</div>
            </div>
            <img src={user.avatar} width={32} height={32} style={{ borderRadius: "50%", border: "2px solid rgba(255,255,255,0.06)" }} />
          </div>
        ) : (
          <button onClick={onLogin} style={{ ...S.btn, padding: "7px 20px", fontSize: 12 }}>Connect</button>
        )}
      </div>
    </header>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" },
  input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px", color: "#e5e5e5", fontSize: 14, fontWeight: 600, outline: "none", fontFamily: "'JetBrains Mono', monospace" },
  btn: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" },
  iconBtn: { width: 34, height: 34, borderRadius: 8, border: "none", background: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  header: { height: 52, borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "rgba(8,8,8,0.95)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50 },
};
