// Subtle 3D tilt for glass cards, following the cursor. Delegated globally
// (rather than attached per-element) so it keeps working across route
// changes without needing to re-attach listeners on every new page's cards.
// Only the small stat tiles tilt. Large panels / the login card hold forms,
// tables and the camera, and tilting those made text look warped.
const SELECTOR = '.stat-card';

export function attachTilt() {
  function onMove(e) {
    const hovered = e.target.closest ? e.target.closest(SELECTOR) : null;
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (el === hovered) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateZ(6px)`;
      } else if (el.style.transform) {
        el.style.transform = '';
      }
    });
  }
  document.addEventListener('mousemove', onMove);
  return () => document.removeEventListener('mousemove', onMove);
}
