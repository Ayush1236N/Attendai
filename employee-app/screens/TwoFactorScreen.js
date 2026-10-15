import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import client, { saveSession } from '../api/client';

// Step 2 of login, only reached when the employee's account has two-factor
// authentication enabled. `challengeToken` came back from /auth/employee-login.
export default function TwoFactorScreen({ challengeToken, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify() {
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-2fa', {
        challengeToken,
        code: code.trim(),
      });
      await saveSession(data.token, data.employee);
      onVerified(data.employee);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onCancel} style={styles.backLink}>
        <Text style={styles.backText}>‹ Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Two-factor authentication</Text>
      <Text style={styles.sub}>Enter the 6-digit code from your authenticator app</Text>

      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        placeholder="000000"
        placeholderTextColor="#7a6a58"
        maxLength={6}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        {loading ? <ActivityIndicator color="#16100c" /> : <Text style={styles.buttonText}>VERIFY</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#16100c' },
  backLink: { marginBottom: 20 },
  backText: { color: '#c9903f', fontSize: 15, fontWeight: '600' },
  heading: { fontSize: 24, fontWeight: '700', color: '#f6ecdf', marginBottom: 8 },
  sub: { fontSize: 14, color: '#b7a591', marginBottom: 30 },
  codeInput: {
    backgroundColor: '#221a14', color: '#f6ecdf', borderRadius: 12,
    paddingVertical: 18, fontSize: 28, textAlign: 'center', letterSpacing: 10,
    borderWidth: 1, borderColor: '#3a2e24', marginBottom: 20,
  },
  button: { backgroundColor: '#c9903f', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#16100c', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  error: { color: '#e2665f', marginBottom: 12, textAlign: 'center' },
});
