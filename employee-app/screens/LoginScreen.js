import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import client, { saveSession } from '../api/client';

// The employee app's LOGIN page — the first thing you see when signed out.
// Attendance (face check-in/out), history, leave and pay all live behind it.
export default function LoginScreen({ onLoginSuccess, onNeed2FA, onForgotPassword, onBack }) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!employeeId.trim() || !password) {
      setError('Enter your Employee ID and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/auth/employee-login', {
        employeeId: employeeId.trim(),
        password,
      });

      if (data.requires2FA) {
        // Account has 2FA enabled — hand off to the code-entry screen
        // instead of logging in directly.
        onNeed2FA(data.challengeToken);
        return;
      }

      await saveSession(data.token, data.employee);
      onLoginSuccess(data.employee, data.twoFactorSetupRequired);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not sign in. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#16100c' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>ATTENDAI</Text>
        <Text style={styles.heading}>Employee sign in</Text>
        <Text style={styles.sub}>Sign in, then scan your face to mark attendance</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Employee ID</Text>
          <TextInput
            style={styles.input}
            value={employeeId}
            onChangeText={setEmployeeId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. EMP0123"
            placeholderTextColor="#7a6a58"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#7a6a58"
          />
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#16100c" /> : <Text style={styles.buttonText}>SIGN IN</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onForgotPassword} style={{ marginTop: 18 }}>
          <Text style={styles.link}>Forgot your password?</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Don't have a portal password yet? Ask your admin to set one for your Employee ID.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60, backgroundColor: '#16100c' },
  backLink: { marginBottom: 20 },
  backText: { color: '#c9903f', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 13, letterSpacing: 3, color: '#c9903f', fontWeight: '700', marginBottom: 6 },
  heading: { fontSize: 26, fontWeight: '700', color: '#f6ecdf', marginBottom: 6 },
  sub: { fontSize: 14, color: '#b7a591', marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { color: '#b7a591', marginBottom: 6, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#221a14', color: '#f6ecdf', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#3a2e24',
  },
  button: {
    backgroundColor: '#c9903f', paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginTop: 10,
  },
  buttonText: { color: '#16100c', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  link: { color: '#3ecf8e', textAlign: 'center', fontWeight: '600' },
  error: { color: '#e2665f', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#7a6a58', fontSize: 12, marginTop: 30, textAlign: 'center', lineHeight: 18 },
});
