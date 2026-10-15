import React, { useEffect, useRef, useState } from 'react';
import { GlassButton } from './glass/index.js';
import { playSuccessChime, playNeutralChime, playErrorChime, speak } from '../lib/kioskAudio';

// Camera + "scan my face" card for the logged-in employee portal.
// Posts a single JPEG ("image") to /attendance/me/check-in or /check-out using
// the employee's own session, so the face is only compared with THEIR
// registered face. `onDone` fires after a successful scan so the page can
// refresh hours/penalties.
export default function FaceCapture({ client, onDone }) {
  const [mode, setMode] = useState('check-in'); // 'check-in' | 'check-out'
  const [cameraState, setCameraState] = useState('starting'); // starting | ready | denied | unsupported
  const [phase, setPhase] = useState('camera'); // camera | scanning | result
  const [result, setResult] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Browsers only expose the camera on HTTPS (or localhost).
      setCameraState('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraState('ready');
    } catch (e) {
      setCameraState('denied');
    }
  }

  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Attach the stream whenever the <video> element is (re)mounted.
  useEffect(() => {
    if (phase !== 'result' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase, cameraState]);

  function reset() {
    setPhase('camera');
    setResult(null);
  }

  function scan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        setPhase('scanning');
        const form = new FormData();
        form.append('image', blob, 'scan.jpg');
        try {
          const { data } = await client.post(
            mode === 'check-in' ? '/attendance/me/check-in' : '/attendance/me/check-out',
            form,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
          const already = data.alreadyCheckedIn || data.alreadyCheckedOut;
          const late = data.attendance?.late;
          setResult({ kind: already ? 'neutral' : late?.isLate && !late.waived ? 'late' : 'success', message: data.message, payload: data });
          already ? playNeutralChime() : playSuccessChime();
          speak(data.message);
          onDone && onDone();
        } catch (err) {
          const message = err.response?.data?.message || 'Something went wrong. Check your connection and try again.';
          setResult({ kind: 'error', message });
          playErrorChime();
          speak(message);
        }
        setPhase('result');
      },
      'image/jpeg',
      0.9
    );
  }

  const colors = { success: '#3ecf8e', neutral: '#e8a33d', late: '#e8a33d', error: '#e2665f' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 420, margin: '0 auto' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        {['check-in', 'check-out'].map((m) => (
          <GlassButton
            key={m}
            variant={mode === m ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            onClick={() => { setMode(m); reset(); }}
          >
            {m === 'check-in' ? 'Check in' : 'Check out'}
          </GlassButton>
        ))}
      </div>

      {(cameraState === 'denied' || cameraState === 'unsupported') && (
        <div style={{ textAlign: 'center' }}>
          <p className="error-text" style={{ marginTop: 0 }}>
            {cameraState === 'denied'
              ? 'Camera access is blocked. Allow the camera for this site in your browser settings, then reload.'
              : 'This browser cannot open the camera here. Open the site over https:// (or on localhost) and try again.'}
          </p>
          <GlassButton variant="secondary" style={{ marginTop: 10 }} onClick={startCamera}>Try again</GlassButton>
        </div>
      )}

      {cameraState === 'ready' && phase !== 'result' && (
        <>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: 'rgba(0,0,0,0.35)' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            {phase === 'scanning' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                Scanning your face…
              </div>
            )}
          </div>
          <GlassButton style={{ width: '100%' }} onClick={scan} disabled={phase === 'scanning'}>
            {phase === 'scanning' ? 'Verifying…' : `Scan face — ${mode === 'check-in' ? 'Check in' : 'Check out'}`}
          </GlassButton>
          <p className="sub" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>
            Face the camera in good light, then tap the button. Your face is matched against your own registration only.
          </p>
        </>
      )}

      {phase === 'result' && result && (
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ fontSize: 40, color: colors[result.kind] }}>{result.kind === 'error' ? '✕' : result.kind === 'neutral' ? 'ℹ' : '✓'}</div>
          <p style={{ fontWeight: 600, margin: '6px 0 4px' }}>{result.message}</p>
          {result.payload?.attendance?.checkIn && <p className="sub">Check-in: {result.payload.attendance.checkIn}</p>}
          {result.payload?.attendance?.checkOut && (
            <p className="sub">
              Check-out: {result.payload.attendance.checkOut} · {result.payload.attendance.workedHours} h worked
            </p>
          )}
          <GlassButton variant="secondary" style={{ marginTop: 12, width: '100%' }} onClick={reset}>
            {result.kind === 'error' ? 'Try again' : 'Done'}
          </GlassButton>
        </div>
      )}
    </div>
  );
}
