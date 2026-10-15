import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import client from '../api/client';
import { C, fmtHours, money } from '../theme';

const STATUS_COLORS = { present: C.green, checked_out: C.green, absent: C.red, leave: C.gold, half_day: C.amber };

// My attendance history: every day with check-in/out times, hours worked,
// where I worked (office/remote) and any late penalty — plus month totals.
export default function MyAttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await client.get('/attendance/me');
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your attendance history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Attendance</Text>

      {loading ? (
        <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={data?.records || []}
          keyExtractor={(item) => item.date}
          onRefresh={load}
          refreshing={loading}
          ListHeaderComponent={
            <View style={styles.summary}>
              <View style={styles.sumCell}><Text style={styles.sumValue}>{data.totalPresent}</Text><Text style={styles.sumLabel}>days present</Text></View>
              <View style={styles.sumCell}><Text style={styles.sumValue}>{fmtHours(data.monthWorkedHours * 60)}</Text><Text style={styles.sumLabel}>this month</Text></View>
              <View style={styles.sumCell}><Text style={[styles.sumValue, { color: C.amber }]}>{data.monthLateCount}</Text><Text style={styles.sumLabel}>late · {money(data.monthPenaltyTotal)}</Text></View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>{item.date} · {item.workMode}</Text>
                <Text style={styles.times}>
                  {item.checkIn ? `In ${item.checkIn}` : 'No check-in'}
                  {item.checkOut ? `  ·  Out ${item.checkOut}` : item.missingCheckout ? '  ·  no check-out' : ''}
                  {item.workedMinutes ? `  ·  ${fmtHours(item.workedMinutes)}` : ''}
                </Text>
                {item.late.isLate && (
                  <Text style={[styles.times, { color: item.late.waived ? C.green : C.amber }]}>
                    Late {item.late.minutesLate} min · {item.late.waived ? 'penalty waived' : `penalty ${money(item.late.penaltyAmount)}`}
                  </Text>
                )}
              </View>
              <Text style={[styles.status, { color: STATUS_COLORS[item.status] || C.muted }]}>{item.status.replace('_', ' ')}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.times}>No attendance records yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: C.bg },
  heading: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 16 },
  summary: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  sumCell: { flex: 1, alignItems: 'center' },
  sumValue: { color: C.gold, fontWeight: '700', fontSize: 18 },
  sumLabel: { color: C.muted, fontSize: 11, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  date: { color: C.text, fontWeight: '700' },
  times: { color: C.muted, fontSize: 12, marginTop: 4 },
  status: { fontWeight: '700', fontSize: 11, textTransform: 'uppercase', marginLeft: 8 },
  error: { color: C.red, textAlign: 'center', marginTop: 20 },
});
