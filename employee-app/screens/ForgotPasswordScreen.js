import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import client from '../api/client';

// Two-step forgot-password flow:
//   1) Enter the email on file -> backend emails a reset link/token.
//   2) Paste the token from that email + choose a new password.
// (Requires the employee to have an email on file — see ProfileScreen.)
export default function ForgotPasswordScreen({ onBack, onDone }) {
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleRequest() {
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setError(''); setLoading(true);
    try {
      const { data } = await client.post('/auth/employee-forgot-password', { email: email.trim() });
      setInfo(data.emailConfigured === false
        ? 'This server is not set up to send emails, so nothing will arrive. Ask your admin to reset your password.'
        : 'If that email is on file, a reset link has been sent. Open the email, copy the link (or the long code at the end of it) and paste it below.');
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!token.trim() || newPassword.length < 4) {
      setError('Enter the reset code from your email and a new password (4+ characters).');
      return;
    }
    // People paste the whole link from the email — pull the token out of it.
    const m = /[?&]token=([a-f0-9]+)/i.exec(token);
    const cleanToken = (m ? m[1] : token).trim();
    setError(''); setLoading(true);
    try {
      await client.post('/auth/employee-reset-password', {
        token: cleanToken,
        password: newPassword,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'That reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#16100c' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backText}>‹ Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Reset your password</Text>

        {step === 'request' ? (
          <>
            <Text style={styles.sub}>Enter the email address on your employee profile.</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
              placeholderTextColor="#7a6a58"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.button} onPress={handleRequest} disabled={loading}>
              {loading ? <ActivityIndicator color="#16100c" /> : <Text style={styles.buttonText}>SEND RESET LINK</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {!!info && <Text style={styles.info}>{info}</Text>}
            <View style={styles.field}>
              <Text style={styles.label}>Reset code (from the email link)</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste the token here"
                placeholderTextColor="#7a6a58"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#7a6a58"
              />
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#16100c" /> : <Text style={styles.buttonText}>RESET PASSWORD</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('request')} style={{ marginTop: 16 }}>
              <Text style={styles.link}>Didn't get an email? Resend</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60, backgroundColor: '#16100c' },
  backLink: { marginBottom: 20 },
  backText: { color: '#c9903f', fontSize: 15, fontWeight: '600' },
  heading: { fontSize: 24, fontWeight: '700', color: '#f6ecdf', marginBottom: 10 },
  sub: { fontSize: 14, color: '#b7a591', marginBottom: 24 },
  info: { fontSize: 13, color: '#3ecf8e', marginBottom: 20, lineHeight: 19 },
  field: { marginBottom: 16 },
  label: { color: '#b7a591', marginBottom: 6, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#221a14', color: '#f6ecdf', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#3a2e24', marginBottom: 8,
  },
  button: { backgroundColor: '#c9903f', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#16100c', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  link: { color: '#3ecf8e', textAlign: 'center', fontWeight: '600' },
  error: { color: '#e2665f', marginBottom: 12, textAlign: 'center' },
});
