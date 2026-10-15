import React, { useEffect, useRef, useState } from 'react';
import publicClient from '../api/publicClient';
import { playSuccessChime, playNeutralChime, playErrorChime, speak } from '../lib/kioskAudio';
import { GlassCard, GlassButton } from '../components/glass/index.js';

// Public, no-login page: an employee opens this link on any phone or laptop,
// scans their face, and their attendance is marked. Mirrors the backend
// contract already used by the native app (POST /attendance/check-in and
// /attendance/check-out with a single "image" file, no auth required).
export default function CheckInKiosk() {
  const [mode, setMode] = useState('check-in'); // 'check-in' | 'check-out'
  const [cameraState, setCameraState] = useState('starting'); // starting | ready | denied
  const [phase, setPhase] = useState('camera'); // camera | scanning | result
  const [result, setResult] = useState(null); // { kind: 'success'|'neutral'|'error', message, detail }

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraState('ready');
      } catch (err) {
        setCameraState('denied');
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function resetToCamera() {
    setPhase('camera');
    setResult(null);
  }

  async function handleScan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setPhase('scanning');

      const form = new FormData();
      form.append('image', blob, 'scan.jpg');

      const endpoint = mode === 'check-in' ? '/attendance/check-in' : '/attendance/check-out';

      try {
        const { data } = await publicClient.post(endpoint, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        // backend's success() envelope spreads data fields alongside message/success
        const message = data.message;
        const already = data.alreadyCheckedIn || data.alreadyCheckedOut;

        setResult({ kind: already ? 'neutral' : 'success', message, payload: data });
        setPhase('result');
        if (already) {
          playNeutralChime();
        } else {
          playSuccessChime();
        }
        speak(message);
      } catch (err) {
        const message =
          err.response?.data?.message ||
          'Something went wrong. Please check your connection and try again.';
        setResult({ kind: 'error', message });
        setPhase('result');
        playErrorChime();
        speak(message);
      }
    }, 'image/jpeg', 0.9);
  }

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={styles.brand}>
        Attend<span style={styles.brandAccent}>ai</span>
      </div>
      <p style={styles.sub}>Face check-in</p>

      <div style={styles.toggleRow}>
        <GlassButton
          variant="secondary"
          style={{ ...styles.toggleBtn, ...(mode === 'check-in' ? styles.toggleBtnActive : {}) }}
          onClick={() => {
            setMode('check-in');
            resetToCamera();
          }}
        >
          Check In
        </GlassButton>
        <GlassButton
          variant="secondary"
          style={{ ...styles.toggleBtn, ...(mode === 'check-out' ? styles.toggleBtnActive : {}) }}
          onClick={() => {
            setMode('check-out');
            resetToCamera();
          }}
        >
          Check Out
        </GlassButton>
      </div>

      <GlassCard style={styles.card} cornerRadius={20}>
        {cameraState === 'denied' && (
          <div style={styles.centerText}>
            <p style={styles.errorText}>Camera access is required to check in.</p>
            <p style={styles.hint}>
              Please allow camera access in your browser's site settings, then reload this page.
            </p>
          </div>
        )}

        {cameraState !== 'denied' && phase !== 'result' && (
          <>
            <div style={styles.videoWrap}>
              <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
              {phase === 'scanning' && (
                <div style={styles.scanOverlay}>
                  <div style={styles.spinner} />
                  <p style={styles.overlayText}>Scanning your face…</p>
                </div>
              )}
            </div>
            <GlassButton
              variant="secondary"
              style={styles.scanBtn}
              onClick={handleScan}
              disabled={cameraState !== 'ready' || phase === 'scanning'}
            >
              {phase === 'scanning' ? 'Processing…' : `Scan face — ${mode === 'check-in' ? 'Check In' : 'Check Out'}`}
            </GlassButton>
            <p style={styles.hint}>Center your face in the frame, in good lighting, then tap the button.</p>
          </>
        )}

        {phase === 'result' && result && (
          <div style={styles.centerText}>
            <div
              style={{
                ...styles.resultBadge,
                background:
                  result.kind === 'success' ? 'rgba(62,207,142,0.15)' :
                  result.kind === 'neutral' ? 'rgba(232,163,61,0.15)' :
                  'rgba(226,102,95,0.15)',
                color:
                  result.kind === 'success' ? '#3ecf8e' :
                  result.kind === 'neutral' ? '#e8a33d' :
                  '#e2665f',
              }}
            >
              {result.kind === 'success' ? '✓' : result.kind === 'neutral' ? 'ℹ' : '✕'}
            </div>
            <p style={styles.resultMessage}>{result.message}</p>
            {result.payload?.attendance?.checkIn && (
              <p style={styles.hint}>Check-in: {result.payload.attendance.checkIn}</p>
            )}
            {result.payload?.attendance?.checkOut && (
              <p style={styles.hint}>
                Check-out: {result.payload.attendance.checkOut}
                {result.payload.attendance.workedHours != null && ` · ${result.payload.attendance.workedHours} h worked`}
              </p>
            )}
            <GlassButton variant="secondary" style={styles.scanBtn} onClick={resetToCamera}>
              Scan again
            </GlassButton>
          </div>
        )}
      </GlassCard>

      <p style={styles.footer}>Keep this page open and reuse the link any time you check in or out.</p>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 20px 48px',
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: '#f6ecdf',
    background:
      'radial-gradient(600px circle at 10% 10%, rgba(201,144,63,0.25), transparent 60%),' +
      'radial-gradient(700px circle at 90% 20%, rgba(111,217,199,0.18), transparent 60%),' +
      'linear-gradient(160deg, #120c09 0%, #1a120d 50%, #120c09 100%)',
    boxSizing: 'border-box',
  },
  brand: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, marginTop: 8 },
  brandAccent: { background: 'linear-gradient(135deg, #c9903f, #6fd9c7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' },
  sub: { color: '#b7a591', fontSize: 14, marginTop: 4, marginBottom: 24 },
  toggleRow: { display: 'flex', gap: 8, marginBottom: 20, width: '100%', maxWidth: 360 },
  toggleBtn: {
    flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid rgba(255,232,209,0.12)',
    background: 'rgba(255,244,232,0.055)', color: '#b7a591', fontWeight: 600, fontSize: 14,
  },
  toggleBtnActive: { background: 'linear-gradient(135deg, rgba(201,144,63,0.35), rgba(111,217,199,0.2))', color: '#fff', border: '1px solid rgba(201,144,63,0.5)' },
  card: {
    width: '100%', maxWidth: 360, background: 'rgba(255,244,232,0.055)', border: '1px solid rgba(255,232,209,0.12)',
    borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    backdropFilter: 'blur(18px) saturate(160%)',
  },
  videoWrap: { position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden', background: 'rgba(0,0,0,0.3)' },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  scanOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' },
  overlayText: { color: '#f6ecdf', fontSize: 14 },
  scanBtn: { width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: '#3ecf8e', color: '#16100c', fontWeight: 700, fontSize: 15 },
  hint: { color: '#b7a591', fontSize: 12.5, textAlign: 'center', margin: 0 },
  errorText: { color: '#e2665f', fontWeight: 600, textAlign: 'center' },
  centerText: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' },
  resultBadge: { width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 },
  resultMessage: { fontSize: 16, fontWeight: 600, textAlign: 'center', margin: 0 },
  footer: { color: '#7d6c5c', fontSize: 12, marginTop: 24, textAlign: 'center' },
};

// Keyframe for the spinner (inline styles can't declare @keyframes, so inject once).
if (typeof document !== 'undefined' && !document.getElementById('kiosk-spin-kf')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'kiosk-spin-kf';
  styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleEl);
}
