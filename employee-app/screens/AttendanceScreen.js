import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { C, fmtHours, money, EMPLOYMENT_LABELS } from '../theme';

// The employee's ATTENDANCE page (separate from the login page): live status
// for today, hours so far, late penalty if any, and the CHECK IN / CHECK OUT
// buttons that open the camera and match against the employee's own face.
export default function AttendanceScreen({ employee, onCheckIn, onCheckOut, refreshKey }) {
  const [today, setToday] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);
  const fetchedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await client.get('/attendance/me/today');
      fetchedAt.current = Date.now();
      setToday(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load today\'s status. Pull down to retry.');
    }
  }, []);

  // Reload on mount and every time we return from the camera (refreshKey).
  useEffect(() => { load(); }, [load, refreshKey]);

  // Keep "hours so far" ticking while checked in.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  let minutes = today?.liveMinutes || 0;
  if (today?.checkedIn && !today?.checkedOut) minutes += Math.floor((Date.now() - fetchedAt.current) / 60000);

  const rec = today?.record;
  const canCheckIn = today && !today.checkedIn;
  const canCheckOut = today && today.checkedIn && !today.checkedOut;
  const statusText = !today ? 'Loading…' : today.checkedOut ? 'Checked out' : today.checkedIn ? 'Checked in' : 'Not checked in';
  const statusColor = !today ? C.muted : today.checkedOut ? C.gold : today.checkedIn ? C.green : C.red;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
    >
      <Text style={styles.brand}>ATTENDAI</Text>
      <Text style={styles.greeting}>{greeting}, {employee?.name?.split(' ')[0]} 👋</Text>
      {today && (
        <Text style={styles.sub}>
          {EMPLOYMENT_LABELS[today.employmentType]} · today is a {today.expectedWorkMode === 'office' ? 'office' : 'remote'} day
          {today.expectedWorkMode === 'office' ? ` · starts ${today.officeStartTime}` : ''}
        </Text>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>TODAY</Text>
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Check-in</Text>
            <Text style={styles.cellValue}>{rec?.checkIn || '--'}</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Check-out</Text>
            <Text style={styles.cellValue}>{rec?.checkOut || '--'}</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Hours</Text>
            <Text style={styles.cellValue}>{today ? fmtHours(minutes) : '--'}</Text>
          </View>
        </View>
      </View>

      {rec?.late?.isLate && (
        <View style={[styles.banner, { borderColor: rec.late.waived ? C.green : C.amber }]}>
          <Text style={{ color: rec.late.waived ? C.green : C.amber, lineHeight: 20 }}>
            {rec.late.waived
              ? `You were ${rec.late.minutesLate} min late, but an admin waived the penalty.`
              : `You checked in ${rec.late.minutesLate} min after start time. Late penalty: ${money(rec.late.penaltyAmount)}. Only an admin can remove it.`}
          </Text>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, styles.checkIn, !canCheckIn && styles.disabled]}
        onPress={onCheckIn}
        disabled={!canCheckIn}
      >
        <Text style={styles.buttonText}>CHECK IN</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.checkOut, !canCheckOut && styles.disabled]}
        onPress={onCheckOut}
        disabled={!canCheckOut}
      >
        <Text style={styles.buttonText}>CHECK OUT</Text>
      </TouchableOpacity>

      {!today && !error && <ActivityIndicator color={C.gold} style={{ marginTop: 12 }} />}
      <Text style={styles.hint}>Your face is checked against your own registered profile only.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60, backgroundColor: C.bg },
  brand: { fontSize: 13, letterSpacing: 3, color: C.gold, fontWeight: '700', marginBottom: 6 },
  greeting: { fontSize: 26, fontWeight: '700', color: C.text, marginBottom: 4 },
  sub: { color: C.muted, fontSize: 13, marginBottom: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardLabel: { color: C.dim, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  status: { fontSize: 22, fontWeight: '700', marginTop: 4, marginBottom: 14 },
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  cellLabel: { color: C.muted, fontSize: 12 },
  cellValue: { color: C.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
  banner: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, backgroundColor: C.card },
  error: { color: C.red, textAlign: 'center', marginBottom: 12 },
  button: { width: '100%', paddingVertical: 20, borderRadius: 18, alignItems: 'center', marginBottom: 14 },
  checkIn: { backgroundColor: C.green },
  checkOut: { backgroundColor: C.red },
  disabled: { opacity: 0.35 },
  buttonText: { color: C.bg, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  hint: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 30 },
});
