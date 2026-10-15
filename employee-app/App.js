import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './screens/LoginScreen';
import TwoFactorScreen from './screens/TwoFactorScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import CheckInScreen from './screens/CheckInScreen';
import CheckOutScreen from './screens/CheckOutScreen';
import MyAttendanceScreen from './screens/MyAttendanceScreen';
import LeaveScreen from './screens/LeaveScreen';
import EarningsScreen from './screens/EarningsScreen';
import ProfileScreen from './screens/ProfileScreen';
import client, { getToken, getStoredProfile, setUnauthorizedHandler } from './api/client';
import { C } from './theme';

// "Attendai" — the PERSONAL employee app (one phone, one account).
// For a shared front-desk device with no login, use the separate
// "Attendai Kiosk" app (/employee-app-kiosk).
//
// Flow:
//   Signed out ->  LOGIN page  (-> 2FA code page if 2FA is on, or Forgot password)
//   Signed in  ->  tabs:  Attendance | History | Leave | Earnings | Account
//                  Attendance has CHECK IN / CHECK OUT, which open the camera
//                  and match your face against YOUR OWN registration.
//
// Many employees can be signed in at once, each on their own phone: every login
// creates its own token + Session row on the server.
const TABS = [
  { key: 'attendance', label: 'Attendance', icon: '📷' },
  { key: 'history', label: 'History', icon: '🗓' },
  { key: 'leave', label: 'Leave', icon: '🌴' },
  { key: 'earnings', label: 'Earnings', icon: '₹' },
  { key: 'account', label: 'Account', icon: '👤' },
];

export default function App() {
  const [employee, setEmployee] = useState(null);
  const [authScreen, setAuthScreen] = useState('login'); // login | 2fa | forgotPassword
  const [challengeToken, setChallengeToken] = useState(null);
  const [needsTwoFactorSetup, setNeedsTwoFactorSetup] = useState(false);
  const [tab, setTab] = useState('attendance');
  const [camera, setCamera] = useState(null); // null | 'checkin' | 'checkout'
  const [refreshKey, setRefreshKey] = useState(0);
  const [checkingSession, setCheckingSession] = useState(true);

  function signedOut() {
    setEmployee(null);
    setCamera(null);
    setTab('attendance');
    setAuthScreen('login');
  }

  useEffect(() => {
    // If the server revokes/expires the session, go back to the login page.
    setUnauthorizedHandler(signedOut);
    (async () => {
      const token = await getToken();
      if (token) {
        const stored = await getStoredProfile();
        if (stored && stored.name) {
          setEmployee(stored);
          // Confirm the saved session is still valid (a 401 triggers signedOut).
          client.get('/employees/me').catch(() => {});
        }
      }
      setCheckingSession(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  function handleLoginSuccess(emp, twoFactorSetupRequired) {
    setEmployee(emp);
    setNeedsTwoFactorSetup(!!twoFactorSetupRequired);
    setTab(twoFactorSetupRequired ? 'account' : 'attendance');
  }

  if (checkingSession) return null;

  // ---------- Signed out: the login page ----------
  if (!employee) {
    return (
      <>
        <StatusBar style="light" />
        {authScreen === 'login' && (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onNeed2FA={(t) => { setChallengeToken(t); setAuthScreen('2fa'); }}
            onForgotPassword={() => setAuthScreen('forgotPassword')}
          />
        )}
        {authScreen === '2fa' && (
          <TwoFactorScreen
            challengeToken={challengeToken}
            onVerified={(emp) => { setChallengeToken(null); handleLoginSuccess(emp, false); }}
            onCancel={() => { setChallengeToken(null); setAuthScreen('login'); }}
          />
        )}
        {authScreen === 'forgotPassword' && (
          <ForgotPasswordScreen onBack={() => setAuthScreen('login')} onDone={() => setAuthScreen('login')} />
        )}
      </>
    );
  }

  // ---------- Camera (full screen, over the tabs) ----------
  if (camera) {
    const done = () => { setCamera(null); setRefreshKey((k) => k + 1); };
    return (
      <>
        <StatusBar style="light" />
        {camera === 'checkin'
          ? <CheckInScreen endpoint="/attendance/me/check-in" onDone={done} />
          : <CheckOutScreen endpoint="/attendance/me/check-out" onDone={done} />}
      </>
    );
  }

  // ---------- Signed in: tabs ----------
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'attendance' && (
          <AttendanceScreen
            employee={employee}
            refreshKey={refreshKey}
            onCheckIn={() => setCamera('checkin')}
            onCheckOut={() => setCamera('checkout')}
          />
        )}
        {tab === 'history' && <MyAttendanceScreen key={refreshKey} />}
        {tab === 'leave' && <LeaveScreen />}
        {tab === 'earnings' && <EarningsScreen key={refreshKey} />}
        {tab === 'account' && (
          <ProfileScreen employee={employee} promptTwoFactorSetup={needsTwoFactorSetup} onLoggedOut={signedOut} />
        )}
      </View>
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabIcon, tab === t.key && { opacity: 1 }]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row', backgroundColor: '#1d1511', borderTopWidth: 1, borderTopColor: C.border,
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 26 : 12,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 18, opacity: 0.5, color: C.text },
  tabLabel: { color: C.dim, fontSize: 11, marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: C.gold },
});
