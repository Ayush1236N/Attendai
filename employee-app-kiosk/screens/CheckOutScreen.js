import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';

export default function CheckOutScreen({ onDone }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [phase, setPhase] = useState('camera'); // camera | scanning | success | already | no_checkin | failed
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.info}>Camera access is required to check out.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant camera permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    setPhase('scanning');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });

      const form = new FormData();
      form.append('image', { uri: photo.uri, name: 'checkout.jpg', type: 'image/jpeg' });

      const { data } = await client.post('/attendance/check-out', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setDetails(data);
      setMessage(data.message);
      setPhase(data.alreadyCheckedOut ? 'already' : 'success');
    } catch (err) {
      const code = err.response?.status;
      const msg = err.response?.data?.message || 'Network error. Please try again.';
      setMessage(msg);
      setPhase(code === 400 ? 'no_checkin' : 'failed');
    }
  }

  if (phase === 'camera' || phase === 'scanning') {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
        <View style={styles.overlay}>
          {phase === 'scanning' ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.overlayText}>Scanning your face…{'\n'}Please wait.</Text>
            </>
          ) : (
            <TouchableOpacity style={styles.captureBtn} onPress={handleCapture}>
              <Text style={styles.btnText}>CHECK OUT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      {phase === 'success' && (
        <>
          <Text style={styles.successTitle}>✓ Checked Out</Text>
          <Text style={styles.info}>{message}</Text>
          <Text style={styles.time}>
            Check-in: {details?.attendance?.checkIn}{'\n'}Check-out: {details?.attendance?.checkOut}
          </Text>
        </>
      )}
      {phase === 'already' && (
        <>
          <Text style={styles.successTitle}>Already Checked Out</Text>
          <Text style={styles.info}>{message}</Text>
        </>
      )}
      {phase === 'no_checkin' && (
        <>
          <Text style={styles.failTitle}>Unable to Check Out</Text>
          <Text style={styles.info}>{message}</Text>
        </>
      )}
      {phase === 'failed' && (
        <>
          <Text style={styles.failTitle}>Face Not Recognized</Text>
          <Text style={styles.info}>{message}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setPhase('camera')}>
            <Text style={styles.btnText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneText}>DONE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16100c', padding: 24 },
  overlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  overlayText: { color: '#f6ecdf', textAlign: 'center', marginTop: 12 },
  captureBtn: { backgroundColor: '#e2665f', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30 },
  btn: { backgroundColor: '#c9903f', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, marginTop: 20 },
  btnText: { color: '#16100c', fontWeight: '700', fontSize: 16 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#3ecf8e', marginBottom: 12 },
  failTitle: { fontSize: 20, fontWeight: '700', color: '#e2665f', marginBottom: 12 },
  info: { fontSize: 16, textAlign: 'center', color: '#f6ecdf' },
  time: { fontSize: 14, color: '#b7a591', marginTop: 10, textAlign: 'center' },
  doneBtn: { marginTop: 30, paddingVertical: 12, paddingHorizontal: 30 },
  doneText: { color: '#c9903f', fontWeight: '700' },
});
