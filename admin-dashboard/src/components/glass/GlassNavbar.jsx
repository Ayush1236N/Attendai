// Sidebar/navbar chrome. Plain element; the glass look comes from the
// .sidebar / .glass-surface CSS (see GlassCard for why liquid-glass-react
// was removed).
export default function GlassNavbar({ children, className = '', style }) {
  return (
    <div className={`glass-surface glass-navbar ${className}`} style={{ height: '100%', ...style }}>
      {children}
    </div>
  );
}
