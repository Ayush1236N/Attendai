// A normal <button> styled with the .btn classes from index.css
// (gold primary, glass secondary, red danger). Real button semantics are kept:
// type="submit" inside forms, disabled, keyboard activation.
// `padding` and the other old liquid-glass props are accepted for
// backwards compatibility.
export default function GlassButton({
  children,
  className = '',
  onClick,
  type = 'button',
  disabled = false,
  variant = 'primary',
  style,
  padding,
  // accepted for backwards compatibility, intentionally unused:
  // eslint-disable-next-line no-unused-vars
  overLight, cornerRadius, elasticity, displacementScale, blurAmount, saturation, aberrationIntensity,
  ...rest
}) {
  const variantClass = variant === 'secondary' ? 'secondary' : variant === 'danger' ? 'danger' : '';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variantClass} ${className}`.trim()}
      style={{
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...(padding ? { padding } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
