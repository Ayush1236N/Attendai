// Glass surface for cards, panels and modals. Pure CSS (backdrop-filter blur +
// translucent fill + bright edge, defined in index.css on .panel/.stat-card/
// .login-card), so it renders identically on every browser, GPU and zoom
// level. It replaces the `liquid-glass-react` refraction effect, which
// produced doubled/ghosted text, off-centre cards and missing button labels
// on some screens. Props from the old API are accepted and ignored, except
// cornerRadius, which still sets the corner rounding.
export default function GlassCard({
  children,
  className = '',
  onClick,
  style,
  cornerRadius,
  // accepted for backwards compatibility, intentionally unused:
  // eslint-disable-next-line no-unused-vars
  overLight, elasticity, displacementScale, blurAmount, saturation, aberrationIntensity,
  ...rest
}) {
  return (
    <div
      className={`glass-surface ${className}`}
      onClick={onClick}
      style={{ ...(cornerRadius ? { borderRadius: cornerRadius } : null), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
