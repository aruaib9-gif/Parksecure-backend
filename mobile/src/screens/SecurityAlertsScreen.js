import React, { useState, useMemo } from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, functions } from '../api/client';
import { Screen, Card, Button, Badge, Row, EmptyState, KeyValue } from '../components/ui';
import { colors, spacing, timeAgo } from '../lib/theme';

const FILTERS = ['open', 'investigating', 'resolved', 'all'];

export default function SecurityAlertsScreen() {
  const [filter, setFilter] = useState('open');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['securityAlerts'],
    queryFn: () => entities.SecurityAlert.list({ limit: 200 }),
    refetchInterval: 30000,
  });

  const alerts = useMemo(() => {
    const all = query.data || [];
    if (filter === 'all') return all;
    return all.filter((a) => a.status === filter);
  }, [query.data, filter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });

  const updateAlert = useMutation({
    mutationFn: ({ id, data }) => entities.SecurityAlert.update(id, data),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const detect = useMutation({
    mutationFn: () => functions.detectSecurityAlerts(),
    onSuccess: (result) => {
      const created = result?.created;
      let summary = 'Detection complete.';
      if (typeof created === 'number') {
        summary = `${created} new alert${created === 1 ? '' : 's'} created.`;
      } else if (created && typeof created === 'object') {
        const parts = Object.entries(created).map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${v}`);
        summary = parts.length ? parts.join('\n') : 'No new alerts created.';
      }
      Alert.alert('Detection complete', summary);
      invalidate();
    },
    onError: (err) => Alert.alert('Detection failed', err.message),
  });

  const confirmResolve = (a) =>
    Alert.alert('Resolve alert?', `"${a.title}" will be marked as resolved.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: () =>
          updateAlert.mutate({ id: a.id, data: { status: 'resolved', resolved_at: new Date().toISOString() } }),
      },
    ]);

  const confirmDismiss = (a) =>
    Alert.alert('Dismiss alert?', `"${a.title}" will be dismissed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', style: 'destructive', onPress: () => updateAlert.mutate({ id: a.id, data: { status: 'dismissed' } }) },
    ]);

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      <View style={{ alignItems: 'flex-end', marginBottom: spacing.md }}>
        <Button
          title="Run Detection Now"
          icon="scan-outline"
          small
          loading={detect.isPending}
          onPress={() => detect.mutate()}
        />
      </View>

      <Row style={{ marginBottom: spacing.md }}>
        {FILTERS.map((f) => (
          <Button
            key={f}
            title={f[0].toUpperCase() + f.slice(1)}
            small
            variant={filter === f ? 'primary' : 'secondary'}
            onPress={() => setFilter(f)}
            style={{ flex: 1, paddingHorizontal: 4 }}
          />
        ))}
      </Row>

      {alerts.map((a) => (
        <Card key={a.id}>
          <Row style={{ marginBottom: spacing.sm, flexWrap: 'wrap', gap: spacing.sm }}>
            <Badge label={a.severity} />
            {a.alert_type ? <Badge label={a.alert_type} /> : null}
            <Badge label={a.status} />
          </Row>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{a.title}</Text>
          {a.description ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{a.description}</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 4, marginBottom: spacing.sm }}>
            {[a.plate_number, a.facility_name].filter(Boolean).join(' · ')}
            {a.plate_number || a.facility_name ? ' · ' : ''}
            {timeAgo(a.created_date)}
          </Text>
          {a.alert_type === 'overstay' ? (
            <>
              <KeyValue label="Overstay" value={`${a.overstay_hours ?? '—'}h`} />
              <KeyValue label="Threshold" value={`${a.threshold_hours ?? '—'}h`} />
            </>
          ) : null}
          {a.discrepancy_details ? (
            <Text style={{ fontSize: 13, color: colors.danger, marginTop: 4 }}>{a.discrepancy_details}</Text>
          ) : null}

          {a.status === 'open' || a.status === 'investigating' ? (
            <Row style={{ marginTop: spacing.md }}>
              {a.status === 'open' ? (
                <Button
                  title="Investigate"
                  icon="search-outline"
                  small
                  style={{ flex: 1 }}
                  loading={updateAlert.isPending && updateAlert.variables?.id === a.id && updateAlert.variables?.data?.status === 'investigating'}
                  onPress={() => updateAlert.mutate({ id: a.id, data: { status: 'investigating' } })}
                />
              ) : null}
              <Button
                title="Resolve"
                icon="checkmark"
                variant="success"
                small
                style={{ flex: 1 }}
                loading={updateAlert.isPending && updateAlert.variables?.id === a.id && updateAlert.variables?.data?.status === 'resolved'}
                onPress={() => confirmResolve(a)}
              />
              <Button
                title="Dismiss"
                icon="close"
                variant="danger"
                small
                style={{ flex: 1 }}
                loading={updateAlert.isPending && updateAlert.variables?.id === a.id && updateAlert.variables?.data?.status === 'dismissed'}
                onPress={() => confirmDismiss(a)}
              />
            </Row>
          ) : null}
        </Card>
      ))}

      {!query.isLoading && alerts.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title={`No ${filter === 'all' ? '' : filter} alerts`}
          subtitle="All clear for now."
        />
      ) : null}
    </Screen>
  );
}
