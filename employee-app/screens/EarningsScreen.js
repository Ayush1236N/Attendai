import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import client from '../api/client';
import { C, fmtHours, money, EMPLOYMENT_LABELS } from '../theme';

function monthKey(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// My hours + pay for a month: total hours, gross, penalties, net, and how it
// was worked out (GET /payroll/me).
export default function EarningsScreen() {
  const [offset, setOffset] = useState(0);
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    client
      .get('/payroll/me', { params: { month: monthKey(offset) } })
      .then((r) => { if (!cancelled) setSlip(r.data.payslip); })
      .catch((err) => { if (!cancelled) { setSlip(null); setError(err.response?.data?.message || 'Could not load your pay details.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offset]);

  const hourly = slip?.payType === 'hourly';
  const Line = ({ label, value, color }) => (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, color && { color }]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Hours & Earnings</Text>

      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setOffset(offset - 1)}><Text style={styles.arrow}>‹</Text></TouchableOpacity>
        <Text style={styles.month}>{monthKey(offset)}</Text>
        <TouchableOpacity onPress={() => setOffset(Math.min(0, offset + 1))} disabled={offset === 0}>
          <Text style={[styles.arrow, offset === 0 && { opacity: 0.25 }]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />}
      {!!error && !loading && <Text style={styles.error}>{error}</Text>}

      {slip && !loading && (
        <>
          <Text style={styles.sub}>
            {EMPLOYMENT_LABELS[slip.employmentType]} · {hourly ? `hourly, ${money(slip.hourlyRate)}/hr` : `monthly, ${money(slip.monthlySalary)}`}
          </Text>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>NET PAY</Text>
            <Text style={styles.heroValue}>{money(slip.netSalary)}</Text>
            <Text style={styles.heroSub}>{fmtHours(slip.totalWorkedHours * 60)} worked · gross {money(slip.grossPay)}</Text>
          </View>

          <View style={styles.card}>
            {hourly ? (
              <>
                <Line label={`Hours worked (${slip.totalWorkedHours} h × ${money(slip.hourlyRate)})`} value={money(slip.hourlyPay)} />
                <Line label={`Paid leave (${slip.paidLeaveDays} day)`} value={money(slip.paidLeavePay)} />
              </>
            ) : (
              <>
                <Line label="Monthly salary" value={money(slip.monthlySalary)} />
                <Line label={`Unpaid leave/absence (${slip.unpaidLeaveDays} day)`} value={`− ${money(slip.leaveDeduction)}`} color={C.red} />
              </>
            )}
            <Line label={`Late penalties (${slip.lateCount}${slip.waivedPenaltyCount ? `, ${slip.waivedPenaltyCount} waived` : ''})`} value={`− ${money(slip.latePenaltyTotal)}`} color={C.red} />
            <Line label="Bonus" value={`+ ${money(slip.bonusTotal)}`} color={C.green} />
            <Line label="Other deductions" value={`− ${money(slip.manualDeductionTotal)}`} color={C.red} />
          </View>

          <Text style={styles.note}>
            Paid leave days: {slip.paidLeaveDays} · Unpaid leave/absent: {slip.unpaidLeaveDays} · Monthly paid-leave allowance: {slip.paidLeaveAllowance}
            {slip.missingCheckouts > 0 ? `\n${slip.missingCheckouts} day(s) have no check-out and count 0 hours — ask an admin to correct them.` : ''}
          </Text>

          <Text style={styles.section}>Day by day</Text>
          {slip.days.length === 0 && <Text style={styles.note}>No attendance this month.</Text>}
          {slip.days.map((d) => (
            <View key={d.date} style={styles.dayRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayDate}>{d.date} · {d.workMode}</Text>
                <Text style={styles.dayMeta}>
                  {d.status}{(d.status === 'leave' || d.status === 'half_day') ? ` (${d.leaveType})` : ''}
                  {d.late.isLate ? `  ·  late ${d.late.minutesLate}m${d.late.waived ? ' (waived)' : ` · ${money(d.late.penaltyAmount)}`}` : ''}
                </Text>
              </View>
              <Text style={styles.dayHours}>{d.workedHours ? fmtHours(d.workedHours * 60) : '—'}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60, backgroundColor: C.bg },
  heading: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 14 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  arrow: { color: C.gold, fontSize: 32, paddingHorizontal: 22 },
  month: { color: C.text, fontSize: 17, fontWeight: '700', minWidth: 90, textAlign: 'center' },
  sub: { color: C.muted, textAlign: 'center', marginBottom: 14, fontSize: 13 },
  hero: { backgroundColor: C.card, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  heroLabel: { color: C.dim, letterSpacing: 2, fontSize: 11, fontWeight: '700' },
  heroValue: { color: C.green, fontSize: 36, fontWeight: '700', marginVertical: 4 },
  heroSub: { color: C.muted, fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  lineLabel: { color: C.muted, flex: 1, paddingRight: 10, fontSize: 13 },
  lineValue: { color: C.text, fontWeight: '700', fontSize: 14 },
  note: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  section: { color: C.gold, fontWeight: '700', marginTop: 6, marginBottom: 10 },
  dayRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  dayDate: { color: C.text, fontWeight: '700' },
  dayMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  dayHours: { color: C.text, fontWeight: '700' },
  error: { color: C.red, textAlign: 'center', marginTop: 20 },
});
