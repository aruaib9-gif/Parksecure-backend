import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { stats, entities } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Screen, Card, StatCard, Row, Badge, EmptyState, SectionTitle } from '../components/ui';
import { colors, spacing, formatNaira, timeAgo } from '../lib/theme';

// Minimal dependency-free bar chart for weekly traffic.
function TrafficChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.entries, d.exits)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 }}>
      {data.map((d) => (
        <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, flex: 1 }}>
            <View style={{ width: 8, borderRadius: 3, height: `${(d.entries / max) * 100}%`, backgroundColor: colors.success, minHeight: 2 }} />
            <View style={{ width: 8, borderRadius: 3, height: `${(d.exits / max) * 100}%`, backgroundColor: colors.info, minHeight: 2 }} />
          </View>
          <Text style={{ fontSize: 9, color: colors.textLight }}>
            {new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'narrow' })}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const statsQuery = useQuery({ queryKey: ['dashboard'], queryFn: () => stats.dashboard(), refetchInterval: 30000 });
  const activityQuery = useQuery({
    queryKey: ['recentScans'],
    queryFn: () => entities.ScanLog.list({ limit: 10, sort: '-created_date' }),
    refetchInterval: 30000,
  });
  const s = statsQuery.data;
  const refreshing = statsQuery.isFetching || activityQuery.isFetching;
  const onRefresh = () => { statsQuery.refetch(); activityQuery.refetch(); };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg }}>
        Welcome back, {user.full_name || user.email}
      </Text>

      <Row>
        <StatCard label="Inside Now" value={s?.vehicles_inside} icon="car" color={colors.primary} />
        <StatCard label="Pending Exits" value={s?.pending_exits} icon="time" color={colors.warning} />
      </Row>
      <Row>
        <StatCard label="Entries Today" value={s?.entries_today} icon="enter" color={colors.success} />
        <StatCard label="Exits Today" value={s?.exits_today} icon="exit" color={colors.info} />
      </Row>
      <Row>
        <StatCard label="Open Alerts" value={s?.open_alerts} icon="warning" color={colors.danger} />
        <StatCard label="Unpaid Fees" value={s ? formatNaira(s.unpaid_amount) : '—'} icon="cash" color={colors.purple} />
      </Row>

      {s?.weekly_traffic ? (
        <Card>
          <SectionTitle style={{ marginTop: 0 }}>Weekly Traffic</SectionTitle>
          <TrafficChart data={s.weekly_traffic} />
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
            <Text style={{ fontSize: 11, color: colors.success }}>■ Entries</Text>
            <Text style={{ fontSize: 11, color: colors.info }}>■ Exits</Text>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Recent Activity</SectionTitle>
      {(activityQuery.data || []).map((scan) => (
        <Card key={scan.id} style={{ paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{scan.plate_number || scan.qr_code_id}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {scan.driver_name || scan.owner_name || 'Unknown driver'} · {timeAgo(scan.created_date)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge label={scan.scan_type} />
              {scan.status !== 'completed' ? <Badge label={scan.status} /> : null}
            </View>
          </View>
        </Card>
      ))}
      {activityQuery.data?.length === 0 ? (
        <EmptyState icon="pulse-outline" title="No activity yet" subtitle="Scans will appear here as vehicles enter and exit" />
      ) : null}
    </Screen>
  );
}
