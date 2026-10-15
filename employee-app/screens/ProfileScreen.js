import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image, Alert,
} from 'react-native';
import client, { clearSession } from '../api/client';
import { C, money, EMPLOYMENT_LABELS, WEEKDAYS } from '../theme';

// Account tab: profile + work/pay type, email, change password, two-factor
// authentication (set up / turn off), and log out (which also ends the
// session on the server).
export default function ProfileScreen({ employee, onLoggedOut, promptTwoFactorSetup }) {
  const [profile, setProfile] = useState(employee || null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState({ text: '', error: false });
  const [pwBusy, setPwBusy] = useState(false);

  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [tfBusy, setTfBusy] = useState(false);
  const [tfMsg, setTfMsg] = useState({ text: '', error: false });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await client.get('/employees/me');
      setProfile(data.employee);
      setEmail(data.employee.email || '');
      if (promptTwoFactorSetup && !data.employee.twoFactorEnabled) {
        setTfMsg({ text: 'Your organization requires two-factor authentication — please set it up below.', error: false });
      }
    } catch (err) {
      // Non-fatal — keep whatever we already have from login.
    } finally {
      setLoading(false);
    }
  }

  async function saveEmail() {
    if (!email.includes('@')) { setEmailMsg('Enter a valid email address.'); return; }
    setSavingEmail(true); setEmailMsg('');
    try {
      await client.put('/employees/me/email', { email: email.trim() });
      setEmailMsg('Email saved. You can now use it to reset your password if needed.');
    } catch (err) {
      setEmailMsg(err.response?.data?.message || 'Could not save email.');
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePassword() {
    if (!curPw || newPw.length < 4) { setPwMsg({ text: 'Enter your current password and a new one (4+ characters).', error: true }); return; }
    setPwBusy(true); setPwMsg({ text: '', error: false });
    try {
      const { data } = await client.put('/auth/employee-me/password', { currentPassword: curPw, newPassword: newPw });
      setPwMsg({ text: data.message, error: false });
      setCurPw(''); setNewPw('');
    } catch (err) {
      setPwMsg({ text: err.response?.data?.message || 'Could not change password.', error: true });
    } finally {
      setPwBusy(false);
    }
  }

  async function startTwoFactorSetup() {
    setTfBusy(true); setTfMsg({ text: '', error: false });
    try {
      const { data } = await client.post('/auth/employee-2fa/setup');
      setQr(data);
    } catch (err) {
      setTfMsg({ text: err.response?.data?.message || 'Could not start 2FA setup.', error: true });
    } finally {
      setTfBusy(false);
    }
  }

  async function confirmTwoFactor() {
    if (code.trim().length !== 6) { setTfMsg({ text: 'Enter the 6-digit code from your authenticator app.', error: true }); return; }
    setTfBusy(true); setTfMsg({ text: '', error: false });
    try {
      await client.post('/auth/employee-2fa/enable', { code: code.trim() });
      setQr(null); setCode('');
      setTfMsg({ text: 'Two-factor authentication is now ON. You will be asked for a code when you sign in.', error: false });
      load();
    } catch (err) {
      setTfMsg({ text: err.response?.data?.message || 'Invalid code — try again.', error: true });
    } finally {
      setTfBusy(false);
    }
  }

  async function turnOffTwoFactor() {
    if (code.trim().length !== 6) { setTfMsg({ text: 'Enter a current 6-digit code to turn 2FA off.', error: true }); return; }
    setTfBusy(true); setTfMsg({ text: '', error: false });
    try {
      await client.post('/auth/employee-2fa/disable', { code: code.trim() });
      setDisabling(false); setCode('');
      setTfMsg({ text: 'Two-factor authentication has been turned off.', error: false });
      load();
    } catch (err) {
      setTfMsg({ text: err.response?.data?.message || 'Invalid code — try again.', error: true });
    } finally {
      setTfBusy(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: handleLogout },
    ]);
  }

  async function handleLogout() {
    try { await client.post('/auth/employee-logout'); } catch (e) { /* clear locally regardless */ }
    await clearSession();
    onLoggedOut();
  }

  if (loading && !profile) {
    return <View style={styles.center}><ActivityIndicator color={C.gold} /></View>;
  }

  const Btn = ({ label, onPress, busy, danger }) => (
    <TouchableOpacity style={[styles.button, danger && styles.danger]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color={C.bg} /> : <Text style={[styles.buttonText, danger && { color: C.text }]}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>My Account</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.meta}>{profile?.employeeId} · {profile?.department || '—'} · {profile?.designation || '—'}</Text>
        <Text style={styles.meta}>
          {EMPLOYMENT_LABELS[profile?.employmentType || 'onsite']}
          {profile?.employmentType === 'hybrid' ? ` (office: ${(profile.hybridOfficeDays || []).map((d) => WEEKDAYS[d]).join(', ')})` : ''}
          {' · '}{profile?.payType === 'hourly' ? `${money(profile.hourlyRate)}/hour` : 'monthly salary'}
        </Text>
        {profile && !profile.faceRegistered && (
          <Text style={[styles.meta, { color: C.amber }]}>Your face isn't registered yet — ask your admin, or you can't check in.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Two-factor authentication</Text>
      <Text style={styles.sectionSub}>
        {profile?.twoFactorEnabled
          ? 'ON — a code from your authenticator app is required to sign in.'
          : 'Add an extra layer of security with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).'}
      </Text>
      {!!tfMsg.text && <Text style={[styles.msg, tfMsg.error && { color: C.red }]}>{tfMsg.text}</Text>}

      {!profile?.twoFactorEnabled && !qr && <Btn label="SET UP 2FA" onPress={startTwoFactorSetup} busy={tfBusy} />}
      {!profile?.twoFactorEnabled && qr && (
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Image source={{ uri: qr.qrDataUrl }} style={{ width: 200, height: 200, borderRadius: 12, backgroundColor: '#fff' }} />
          <Text style={[styles.sectionSub, { textAlign: 'center', marginTop: 10 }]}>
            Scan this with your authenticator app, then type the 6-digit code it shows.
          </Text>
          <TextInput
            style={[styles.input, { textAlign: 'center', letterSpacing: 8, fontSize: 20, alignSelf: 'stretch' }]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={C.dim}
            maxLength={6}
          />
          <View style={{ alignSelf: 'stretch' }}><Btn label="CONFIRM & ENABLE" onPress={confirmTwoFactor} busy={tfBusy} /></View>
        </View>
      )}
      {profile?.twoFactorEnabled && !disabling && <Btn label="TURN OFF 2FA" danger onPress={() => { setDisabling(true); setTfMsg({ text: '', error: false }); }} />}
      {profile?.twoFactorEnabled && disabling && (
        <>
          <TextInput
            style={[styles.input, { textAlign: 'center', letterSpacing: 8, fontSize: 20 }]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={C.dim}
            maxLength={6}
          />
          <Btn label="CONFIRM TURN OFF" danger onPress={turnOffTwoFactor} busy={tfBusy} />
          <TouchableOpacity onPress={() => { setDisabling(false); setCode(''); }} style={{ alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: C.muted }}>Cancel</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionTitle}>Email address</Text>
      <Text style={styles.sectionSub}>Used to send you a password-reset link if you ever forget your password.</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="you@example.com"
        placeholderTextColor={C.dim}
      />
      {!!emailMsg && <Text style={styles.msg}>{emailMsg}</Text>}
      <Btn label="SAVE EMAIL" onPress={saveEmail} busy={savingEmail} />

      <Text style={styles.sectionTitle}>Change password</Text>
      <TextInput style={styles.input} value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="Current password" placeholderTextColor={C.dim} />
      <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="New password" placeholderTextColor={C.dim} />
      {!!pwMsg.text && <Text style={[styles.msg, pwMsg.error && { color: C.red }]}>{pwMsg.text}</Text>}
      <Btn label="UPDATE PASSWORD" onPress={changePassword} busy={pwBusy} />

      <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout}>
        <Text style={styles.logoutText}>LOG OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  heading: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 20 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 18, marginBottom: 22, borderWidth: 1, borderColor: C.border },
  name: { fontSize: 18, fontWeight: '700', color: C.text },
  meta: { color: C.muted, marginTop: 4, fontSize: 13 },
  sectionTitle: { color: C.gold, fontWeight: '700', fontSize: 14, marginTop: 10, marginBottom: 4 },
  sectionSub: { color: C.muted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  input: {
    backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  button: { backgroundColor: C.green, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  danger: { backgroundColor: C.red },
  buttonText: { color: C.bg, fontWeight: '700', letterSpacing: 1 },
  logoutButton: { borderColor: C.red, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  logoutText: { color: C.red, fontWeight: '700', letterSpacing: 1 },
  msg: { color: C.green, fontSize: 13, marginBottom: 10, lineHeight: 18 },
});
