import React, { useState, useMemo } from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, payments } from '../api/client';
import { Screen, Card, Button, Badge, Row, StatCard, EmptyState, KeyValue } from '../components/ui';
import { colors, spacing, formatNaira, formatDate, timeAgo } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'parking', label: 'Parking' },
  { key: 'bills', label: 'Bills' },
  { key: 'subscriptions', label: 'Subscriptions' },
];

export default function PaymentsScreen() {
  const [tab, setTab] = useState('parking');
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const parkingQuery = useQuery({
    queryKey: ['payments', 'parking'],
    queryFn: () => entities.Payment.list({ limit: 200 }),
    enabled: tab === 'parking',
  });
  const billsQuery = useQuery({
    queryKey: ['payments', 'bills'],
    queryFn: () => entities.UserBill.list({ limit: 200 }),
    enabled: tab === 'bills',
  });
  const subsQuery = useQuery({
    queryKey: ['payments', 'subscriptions'],
    queryFn: () => entities.SubscriptionPayment.list(),
    enabled: tab === 'subscriptions',
  });

  const activeQuery = tab === 'parking' ? parkingQuery : tab === 'bills' ? billsQuery : subsQuery;
  const records = activeQuery.data || [];

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    for (const r of records) {
      if (r.status === 'pending') pending += Number(r.amount) || 0;
      if (r.status === 'paid') paid += Number(r.amount) || 0;
    }
    return { pending, paid };
  }, [records]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payments'] });

  const payCard = useMutation({
    mutationFn: ({ record_type, id }) => payments.initPaystack(record_type, id, undefined),
    onSuccess: (r) => {
      if (r?.authorization_url) Linking.openURL(r.authorization_url);
      else Alert.alert('Payment', 'No payment link was returned.');
    },
    onError: (err) => Alert.alert('Card payment failed', err.message),
  });

  const markCash = useMutation({
    mutationFn: (id) => payments.markPaid(id, 'cash'),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const waive = useMutation({
    mutationFn: (id) => payments.waive(id),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const markSubPaid = useMutation({
    mutationFn: (id) =>
      entities.SubscriptionPayment.update(id, { status: 'paid', paid_at: new Date().toISOString() }),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const confirmCash = (p) =>
    Alert.alert('Mark as paid (cash)?', `${formatNaira(p.amount)} for ${p.plate_number || 'this payment'} will be recorded as paid in cash.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Paid', onPress: () => markCash.mutate(p.id) },
    ]);

  const confirmWaive = (p) =>
    Alert.alert('Waive payment?', `${formatNaira(p.amount)} for ${p.plate_number || 'this payment'} will be waived.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Waive', style: 'destructive', onPress: () => waive.mutate(p.id) },
    ]);

  const confirmSubPaid = (s) =>
    Alert.alert('Mark subscription paid?', `${formatNaira(s.amount)} for ${s.facility_name || 'this facility'} will be marked as paid.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Paid', onPress: () => markSubPaid.mutate(s.id) },
    ]);

  return (
    <Screen refreshing={activeQuery.isFetching} onRefresh={activeQuery.refetch}>
      <Row style={{ marginBottom: spacing.md }}>
        {TABS.map((t) => (
          <Button
            key={t.key}
            title={t.label}
            small
            variant={tab === t.key ? 'primary' : 'secondary'}
            onPress={() => setTab(t.key)}
            style={{ flex: 1, paddingHorizontal: 4 }}
          />
        ))}
      </Row>

      <Row style={{ marginBottom: spacing.md }}>
        <StatCard label="Pending" value={formatNaira(totals.pending)} icon="hourglass-outline" color={colors.warning} />
        <StatCard label="Paid" value={formatNaira(totals.paid)} icon="checkmark-circle-outline" color={colors.success} />
      </Row>

      {tab === 'parking' &&
        records.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{p.plate_number || 'Unknown'}</Text>
              <Badge label={p.status} />
            </View>
            <Text style={{ fontSize: 12, color: colors.textLight, marginBottom: spacing.sm }}>{timeAgo(p.created_date)}</Text>
            <KeyValue label="Owner" value={p.owner_name} />
            <KeyValue label="Amount" value={formatNaira(p.amount)} />
            {p.billing_mode ? <KeyValue label="Billing mode" value={String(p.billing_mode).replace(/_/g, ' ')} /> : null}
            {p.status === 'pending' ? (
              <Row style={{ marginTop: spacing.md }}>
                <Button
                  title="Card"
                  icon="card-outline"
                  small
                  style={{ flex: 1 }}
                  loading={payCard.isPending && payCard.variables?.id === p.id}
                  onPress={() => payCard.mutate({ record_type: 'payment', id: p.id })}
                />
                <Button
                  title="Cash"
                  icon="cash-outline"
                  variant="success"
                  small
                  style={{ flex: 1 }}
                  loading={markCash.isPending && markCash.variables === p.id}
                  onPress={() => confirmCash(p)}
                />
                {isAdmin ? (
                  <Button
                    title="Waive"
                    icon="close-circle-outline"
                    variant="danger"
                    small
                    style={{ flex: 1 }}
                    loading={waive.isPending && waive.variables === p.id}
                    onPress={() => confirmWaive(p)}
                  />
                ) : null}
              </Row>
            ) : null}
          </Card>
        ))}

      {tab === 'bills' &&
        records.map((b) => (
          <Card key={b.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{b.title || 'Bill'}</Text>
              <Badge label={b.status} />
            </View>
            <Text style={{ fontSize: 12, color: colors.textLight, marginBottom: spacing.sm }}>{timeAgo(b.created_date)}</Text>
            <KeyValue label="Owner" value={b.owner_email} />
            <KeyValue label="Amount" value={formatNaira(b.amount)} />
            <KeyValue label="Due" value={formatDate(b.due_date)} />
            {b.status === 'pending' ? (
              <Button
                title="Pay with Card"
                icon="card-outline"
                small
                style={{ marginTop: spacing.md }}
                loading={payCard.isPending && payCard.variables?.id === b.id}
                onPress={() => payCard.mutate({ record_type: 'user_bill', id: b.id })}
              />
            ) : null}
          </Card>
        ))}

      {tab === 'subscriptions' &&
        records.map((s) => (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{s.facility_name || 'Facility'}</Text>
              <Badge label={s.status} />
            </View>
            <Text style={{ fontSize: 12, color: colors.textLight, marginBottom: spacing.sm }}>
              {s.month ? `${s.month}/${s.year}` : ''}
            </Text>
            <KeyValue label="Amount" value={formatNaira(s.amount)} />
            {s.status !== 'paid' ? (
              <Button
                title="Mark Paid"
                icon="checkmark"
                variant="success"
                small
                style={{ marginTop: spacing.md }}
                loading={markSubPaid.isPending && markSubPaid.variables === s.id}
                onPress={() => confirmSubPaid(s)}
              />
            ) : null}
          </Card>
        ))}

      {!activeQuery.isLoading && records.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No records" subtitle="Nothing to show for this tab yet." />
      ) : null}
    </Screen>
  );
}
