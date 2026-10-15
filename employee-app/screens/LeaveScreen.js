import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import client from '../api/client';

const STATUS_COLORS = { pending: '#e0b25a', approved: '#3ecf8e', rejected: '#e2665f' };

// Employee self-service: apply for leave and track the status of past
// requests. Approval happens on the admin dashboard — once approved, the
// matching days automatically show up as 'leave' in My Attendance and in
// that month's salary report (same write path as the admin's own "mark
// leave" tool, just triggered through this request/approval flow instead).
export default function LeaveScreen() {
  const [tab, setTab] = useState('apply'); // 'apply' | 'history'

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState('leave');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const { data } = await client.get('/leave-requests/me');
      setHistory(data.requests || []);
    } catch (err) {
      // Non-fatal — the Apply tab still works even if history fails to load.
    } finally {
      setLoadingHistory(false);
    }
  }

  function validDateFormat(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  async function submit() {
    setSubmitMsg('');
    if (!validDateFormat(fromDate) || !validDateFormat(toDate)) {
      setSubmitMsg('Enter dates as YYYY-MM-DD, e.g. 2026-10-05.');
      return;
    }
    if (!reason.trim()) {
      setSubmitMsg('Please enter a reason for your leave.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/leave-requests', { fromDate, toDate, type, reason: reason.trim() });
      setSubmitMsg('Leave request submitted — you\'ll see its status in the History tab once reviewed.');
      setFromDate('');
      setToDate('');
      setReason('');
      loadHistory();
      setTab('history');
    } catch (err) {
      setSubmitMsg(err.response?.data?.message || 'Could not submit your leave request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Leave</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === 'apply' && styles.tabActive]} onPress={() => setTab('apply')}>
          <Text style={[styles.tabText, tab === 'apply' && styles.tabTextActive]}>Apply</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'history' && styles.tabActive]} onPress={() => setTab('history')}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {tab === 'apply' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>From date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#7a6a58"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>To date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#7a6a58"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.typeChip, type === 'leave' && styles.typeChipActive]}
                  onPress={() => setType('leave')}
                >
                  <Text style={[styles.typeChipText, type === 'leave' && styles.typeChipTextActive]}>Full day</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, type === 'half_day' && styles.typeChipActive]}
                  onPress={() => setType('half_day')}
                >
                  <Text style={[styles.typeChipText, type === 'half_day' && styles.typeChipTextActive]}>Half day</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Reason</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. family function, feeling unwell"
                placeholderTextColor="#7a6a58"
                multiline
              />
            </View>

            {!!submitMsg && <Text style={styles.msg}>{submitMsg}</Text>}

            <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#16100c" /> : <Text style={styles.submitBtnText}>SUBMIT REQUEST</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : loadingHistory ? (
        <ActivityIndicator color="#c9903f" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>{item.fromDate}{item.fromDate !== item.toDate ? ` → ${item.toDate}` : ''}</Text>
                <Text style={styles.times}>{item.type === 'half_day' ? 'Half day' : 'Full day'} · {item.reason}</Text>
                {item.status === 'approved' && (
                  <Text style={styles.times}>
                    Pay: {item.leaveType === 'paid' ? 'Paid leave' : item.leaveType === 'unpaid' ? 'Unpaid leave' : 'Paid within your monthly allowance'}
                  </Text>
                )}
                {item.status !== 'pending' && !!item.adminRemarks && (
                  <Text style={styles.times}>Note: {item.adminRemarks}</Text>
                )}
              </View>
              <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.times}>No leave requests yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#16100c' },
  backLink: { marginBottom: 20 },
  backText: { color: '#c9903f', fontSize: 15, fontWeight: '600' },
  heading: { fontSize: 24, fontWeight: '700', color: '#f6ecdf', marginBottom: 16 },
  tabRow: { flexDirection: 'row', backgroundColor: '#221a14', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#c9903f' },
  tabText: { color: '#b7a591', fontWeight: '600' },
  tabTextActive: { color: '#16100c' },
  field: { marginBottom: 16 },
  label: { color: '#b7a591', marginBottom: 6, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#221a14', color: '#f6ecdf', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#3a2e24',
  },
  typeChip: {
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999,
    borderWidth: 1, borderColor: '#3a2e24', backgroundColor: '#221a14',
  },
  typeChipActive: { backgroundColor: '#c9903f', borderColor: '#c9903f' },
  typeChipText: { color: '#b7a591', fontWeight: '600' },
  typeChipTextActive: { color: '#16100c' },
  submitBtn: { backgroundColor: '#c9903f', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  submitBtnText: { color: '#16100c', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  msg: { color: '#3ecf8e', fontSize: 13, marginBottom: 14 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#221a14', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#3a2e24',
  },
  date: { color: '#f6ecdf', fontWeight: '700' },
  times: { color: '#b7a591', fontSize: 12, marginTop: 4 },
  status: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase', marginLeft: 10 },
});
