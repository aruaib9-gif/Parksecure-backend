import React, { useState } from 'react';
import { View, Text, Alert, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { entities, payments } from '../api/client';
import { Screen, Card, Button, Badge, EmptyState, SectionTitle, KeyValue } from '../components/ui';
import { colors, spacing, formatNaira, formatDate } from '../lib/theme';

const formatDuration = (mins) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

export default function OwnerBillsScreen() {
  const [historyOpen, setHistoryOpen] = useState(false);

  const balanceQuery = useQuery({
    queryKey: ['ownerBalance'],
    queryFn: () => payments.myBalance(),
  });

  const historyQuery = useQuery({
    queryKey: ['ownerPaidBills'],
    queryFn: () => entities.UserBill.filter({ status: 'paid' }, { limit: 20 }),
  });

  const pay = useMutation({
    mutationFn: ({ record_type, record_id }) => payments.initPaystack(record_type, record_id),
    onSuccess: (r) => {
      if (r?.authorization_url) Linking.openURL(r.authorization_url);
      else Alert.alert('Payment error', 'Could not start the payment. Please try again.');
    },
    onError: (err) => Alert.alert('Payment error', err.message),
  });

  const refreshing = balanceQuery.isFetching || historyQuery.isFetching;
  const onRefresh = () => {
    balanceQuery.refetch();
    historyQuery.refetch();
  };

  const { bills = [], payments: parkingFees = [], total_due = 0 } = balanceQuery.data || {};
  const pendingFees = parkingFees.filter((p) => p.status === 'pending');
  const paidBills = historyQuery.data || [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Card style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.danger}18` }}>
          <Ionicons name="wallet-outline" size={18} color={total_due > 0 ? colors.danger : colors.success} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '800', color: total_due > 0 ? colors.danger : colors.success, marginTop: 8 }}>
          {formatNaira(total_due)}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Total due</Text>
      </Card>

      {total_due === 0 && bills.length === 0 && pendingFees.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="No outstanding bills" subtitle="You're all settled up." />
      ) : null}

      {bills.length > 0 ? (
        <>
          <SectionTitle>Bills</SectionTitle>
          {bills.map((bill) => (
            <Card key={bill.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, flexShrink: 1 }}>{bill.title || 'Bill'}</Text>
                <Badge label={bill.status} />
              </View>
              {bill.description ? (
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{bill.description}</Text>
              ) : null}
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.sm }}>
                {formatNaira(bill.amount)}
              </Text>
              {bill.due_date ? (
                <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>Due {formatDate(bill.due_date)}</Text>
              ) : null}
              <Button
                title="Pay with Card"
                icon="card-outline"
                style={{ marginTop: spacing.md }}
                loading={pay.isPending && pay.variables?.record_id === bill.id}
                onPress={() => pay.mutate({ record_type: 'user_bill', record_id: bill.id })}
              />
            </Card>
          ))}
        </>
      ) : null}

      {pendingFees.length > 0 ? (
        <>
          <SectionTitle>Parking Fees</SectionTitle>
          {pendingFees.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{p.plate_number || 'Vehicle'}</Text>
                <Badge label={p.status} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.sm }}>
                {formatNaira(p.amount)}
              </Text>
              {p.billing_mode ? <KeyValue label="Billing" value={String(p.billing_mode).replace(/_/g, ' ')} /> : null}
              {p.duration_minutes ? <KeyValue label="Duration" value={formatDuration(p.duration_minutes)} /> : null}
              <Button
                title="Pay with Card"
                icon="card-outline"
                style={{ marginTop: spacing.md }}
                loading={pay.isPending && pay.variables?.record_id === p.id}
                onPress={() => pay.mutate({ record_type: 'payment', record_id: p.id })}
              />
            </Card>
          ))}
        </>
      ) : null}

      <TouchableOpacity
        onPress={() => setHistoryOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.md }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Payment History</Text>
        <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {historyOpen ? (
        paidBills.length > 0 ? (
          paidBills.map((bill) => (
            <Card key={bill.id} style={{ paddingVertical: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{bill.title || 'Bill'}</Text>
                  <Text style={{ fontSize: 12, color: colors.textLight }}>{formatDate(bill.paid_date || bill.updated_date)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{formatNaira(bill.amount)}</Text>
                  <Badge label="paid" />
                </View>
              </View>
            </Card>
          ))
        ) : (
          <EmptyState icon="receipt-outline" title="No payments yet" />
        )
      ) : null}
    </Screen>
  );
}
