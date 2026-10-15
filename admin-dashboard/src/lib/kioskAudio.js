// Lightweight, dependency-free "tune + greeting" for the face check-in kiosk.
// Uses the Web Audio API to synthesize a short chime (no audio file needed,
// so it works the moment the page loads over any network) and the browser's
// built-in speech synthesis to read the backend's greeting message aloud.

let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(ctx, freq, startTime, duration, type = 'sine', peakGain = 0.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// Bright two-note ascending chime — successful check-in/check-out.
export function playSuccessChime() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, 587.33, t, 0.16); // D5
    tone(ctx, 880.0, t + 0.14, 0.28); // A5
  } catch (e) {
    // Audio isn't available (e.g. autoplay policy) - fail silently, the
    // visual + spoken result still gets shown.
  }
}

// Single soft note — informational (e.g. "already checked in").
export function playNeutralChime() {
  try {
    const ctx = getCtx();
    tone(ctx, 660, ctx.currentTime, 0.22, 'sine', 0.14);
  } catch (e) {
    /* noop */
  }
}

// Low descending buzz — face not recognized / error.
export function playErrorChime() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, 330, t, 0.18, 'square', 0.1);
    tone(ctx, 220, t + 0.14, 0.24, 'square', 0.1);
  } catch (e) {
    /* noop */
  }
}

// Speaks the given message aloud, if the browser supports it.
export function speak(message) {
  try {
    if (!('speechSynthesis' in window) || !message) return;
    window.speechSynthesis.cancel(); // don't stack up if scans happen quickly
    const utter = new SpeechSynthesisUtterance(message);
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    /* noop */
  }
}
