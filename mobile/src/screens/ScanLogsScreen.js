import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { entities } from '../api/client';
import { Screen, Card, Badge, Button, Row, EmptyState, Loading } from '../components/ui';
import { colors, spacing, timeAgo } from '../lib/theme';

const TYPE_FILTERS = ['all', 'entry', 'exit'];
const STATUS_FILTERS = ['all', 'completed', 'pending_approval', 'denied'];

export default function ScanLogsScreen() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const query = useQuery({
    queryKey: ['scanLogs'],
    queryFn: () => entities.ScanLog.list({ limit: 200, sort: '-created_date' }),
  });

  const logs = useMemo(() => {
    let list = query.data || [];
    if (typeFilter !== 'all') list = list.filter((l) => l.scan_type === typeFilter);
    if (statusFilter !== 'all') list = list.filter((l) => l.status === statusFilter);
    return list;
  }, [query.data, typeFilter, statusFilter]);

  if (query.isLoading) return <Loading />;

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      <Row style={{ marginBottom: spacing.sm }}>
        {TYPE_FILTERS.map((f) => (
          <Button
            key={f}
            title={f[0].toUpperCase() + f.slice(1)}
            small
            variant={typeFilter === f ? 'primary' : 'secondary'}
            onPress={() => setTypeFilter(f)}
            style={{ flex: 1, paddingHorizontal: 4 }}
          />
        ))}
      </Row>
      <Row style={{ marginBottom: spacing.md }}>
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f}
            title={f === 'all' ? 'All statuses' : f === 'pending_approval' ? 'Pending' : f[0].toUpperCase() + f.slice(1)}
            small
            variant={statusFilter === f ? 'primary' : 'secondary'}
            onPress={() => setStatusFilter(f)}
            style={{ flex: 1, paddingHorizontal: 2 }}
          />
        ))}
      </Row>

      {logs.map((log) => (
        <Card key={log.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 }}>
              {log.plate_number || log.qr_code_id || 'Unknown'}
            </Text>
            <Row style={{ gap: spacing.xs }}>
              <Badge label={log.scan_type} />
              {log.status && log.status !== 'completed' ? <Badge label={log.status} /> : null}
            </Row>
          </View>
          <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>
            {timeAgo(log.created_date)}
          </Text>
          {log.driver_name || log.owner_name ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
              {log.driver_name || log.owner_name}
            </Text>
          ) : null}
          {log.scanned_by_name ? (
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              Scanned by {log.scanned_by_name}
            </Text>
          ) : null}
          {Array.isArray(log.items_declared) && log.items_declared.length > 0 ? (
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              {log.items_declared.length} item{log.items_declared.length === 1 ? '' : 's'}
            </Text>
          ) : null}
          {log.discrepancies ? (
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 4 }}>
              {log.discrepancies}
            </Text>
          ) : null}
        </Card>
      ))}

      {logs.length === 0 ? (
        <EmptyState icon="scan-outline" title="No scan logs" subtitle="Scans will appear here as vehicles enter and exit." />
      ) : null}
    </Screen>
  );
}
