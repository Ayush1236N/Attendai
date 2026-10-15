import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CheckInScreen from './screens/CheckInScreen';
import CheckOutScreen from './screens/CheckOutScreen';

// Attendai Kiosk — the "device" half of the two-app split:
//   - This app: lives on a shared tablet/phone at the entrance. No login,
//     no accounts, no leave, no profile — just a greeting and a face scan
//     for check-in/check-out, matched against every registered employee.
//   - The separate "Attendai" (employee-app) project: lives on each
//     employee's own phone, requires login, and is where they view their
//     attendance/leave activity, apply for leave, and manage their account.
export default function App() {
  const [screen, setScreen] = useState('home');

  return (
    <>
      <StatusBar style="light" />
      {screen === 'home' && (
        <Home onCheckIn={() => setScreen('checkin')} onCheckOut={() => setScreen('checkout')} />
      )}
      {screen === 'checkin' && <CheckInScreen onDone={() => setScreen('home')} />}
      {screen === 'checkout' && <CheckOutScreen onDone={() => setScreen('home')} />}
    </>
  );
}

function Home({ onCheckIn, onCheckOut }) {
  const [now, setNow] = useState(new Date());

  // A live clock reinforces that this is a kiosk display, not a personal
  // phone screen — and gives the greeting something to key off of.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ATTENDAI KIOSK</Text>
      <Text style={styles.time}>{timeLabel}</Text>
      <Text style={styles.date}>{dateLabel}</Text>
      <Text style={styles.greeting}>{greeting}! 👋</Text>
      <Text style={styles.hint}>Step up and scan your face to check in or out.</Text>

      <TouchableOpacity style={[styles.button, styles.checkIn]} onPress={onCheckIn}>
        <Text style={styles.buttonText}>CHECK IN</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.checkOut]} onPress={onCheckOut}>
        <Text style={styles.buttonText}>CHECK OUT</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16100c', padding: 24 },
  title: { fontSize: 14, letterSpacing: 3, color: '#c9903f', fontWeight: '700', marginBottom: 20 },
  time: { fontSize: 46, fontWeight: '700', color: '#f6ecdf', fontVariant: ['tabular-nums'] },
  date: { fontSize: 14, color: '#b7a591', marginTop: 4, marginBottom: 24 },
  greeting: { fontSize: 26, fontWeight: '700', color: '#f6ecdf', marginBottom: 8, textAlign: 'center' },
  hint: { color: '#b7a591', fontSize: 13, textAlign: 'center', marginBottom: 36 },
  button: {
    width: '100%', paddingVertical: 22, borderRadius: 18, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 6,
  },
  checkIn: { backgroundColor: '#3ecf8e' },
  checkOut: { backgroundColor: '#e2665f' },
  buttonText: { color: '#16100c', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
});
