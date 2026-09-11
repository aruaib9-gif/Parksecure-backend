import React from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getQueue, flushQueue, clearSynced } from '../lib/offlineQueue';
import { Screen, Card, Button, Badge, Row, EmptyState, KeyValue } from '../components/ui';
import { colors, spacing, formatDate } from '../lib/theme';

export default function SyncStatusScreen() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['offlineQueue'],
    queryFn: getQueue,
    refetchInterval: 5000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['offlineQueue'] });

  const sync = useMutation({
    mutationFn: () => flushQueue(),
    onSuccess: ({ synced, failed, remaining }) => {
      invalidate();
      Alert.alert('Sync complete', `Synced: ${synced}\nFailed: ${failed}\nRemaining: ${remaining}`);
    },
    onError: (err) => Alert.alert('Sync failed', err.message),
  });

  const clear = useMutation({
    mutationFn: () => clearSynced(),
    onSuccess: () => invalidate(),
    onError: (err) => Alert.alert('Clear failed', err.message),
  });

  const queue = query.data || [];
  const pendingCount = queue.filter((op) => op.status !== 'synced').length;
  const syncedCount = queue.filter((op) => op.status === 'synced').length;

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      <Row style={{ marginBottom: spacing.md }}>
        <Button
          title="Sync Now"
          icon="sync"
          style={{ flex: 1 }}
          loading={sync.isPending}
          disabled={pendingCount === 0}
          onPress={() => sync.mutate()}
        />
        <Button
          title="Clear Synced"
          icon="trash-bin"
          variant="secondary"
          style={{ flex: 1 }}
          loading={clear.isPending}
          disabled={syncedCount === 0}
          onPress={() => clear.mutate()}
        />
      </Row>

      {queue.length > 0 ? (
        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.md }}>
          {pendingCount} pending / {queue.length} queued scan{queue.length === 1 ? '' : 's'}
        </Text>
      ) : null}

      {queue.map((op) => (
        <Card key={op.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Badge label={op.type === 'ENTRY' ? 'entry' : 'exit'} status={op.type === 'ENTRY' ? 'entry' : 'exit'} />
            <Badge label={op.status} status={op.status === 'synced' ? 'completed' : op.status} />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <KeyValue label="QR code" value={op.payload?.qr_code_id} />
            <KeyValue label="Queued" value={formatDate(op.createdAt)} />
            <KeyValue label="Retries" value={String(op.retryCount ?? 0)} />
          </View>
          {op.lastError ? (
            <Text style={{ fontSize: 12, color: colors.danger, marginTop: spacing.xs }}>{op.lastError}</Text>
          ) : null}
        </Card>
      ))}

      {queue.length === 0 ? (
        <EmptyState icon="cloud-done-outline" title="All synced" subtitle="Offline scans will appear here when the network is down." />
      ) : null}
    </Screen>
  );
}
