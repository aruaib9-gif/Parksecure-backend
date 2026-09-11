import React, { useState, useMemo } from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities } from '../api/client';
import { Screen, Card, Button, Badge, Input, Select, Row, StatCard, SectionTitle, EmptyState } from '../components/ui';
import { colors, spacing, timeAgo } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

const DURATIONS = [
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
];

export default function ShiftHandoverScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [hours, setHours] = useState(8);
  const [nextOfficerName, setNextOfficerName] = useState('');
  const [nextOfficerEmail, setNextOfficerEmail] = useState('');
  const [notes, setNotes] = useState('');

  const shiftStart = useMemo(() => new Date(Date.now() - hours * 3600000), [hours]);

  const scansQuery = useQuery({
    queryKey: ['handover', 'scanLogs'],
    queryFn: () => entities.ScanLog.list({ limit: 500 }),
  });
  const insideQuery = useQuery({
    queryKey: ['handover', 'vehiclesInside'],
    queryFn: () => entities.Vehicle.filter({ is_inside: true }),
  });
  const pendingExitsQuery = useQuery({
    queryKey: ['handover', 'pendingExits'],
    queryFn: () => entities.ExitRequest.filter({ status: 'pending' }),
  });
  const handoversQuery = useQuery({
    queryKey: ['handovers'],
    queryFn: () => entities.ShiftHandover.list({ limit: 10 }),
  });

  const stats = useMemo(() => {
    const scans = (scansQuery.data || []).filter(
      (s) => s.created_date && new Date(s.created_date) >= shiftStart
    );
    return {
      entries: scans.filter((s) => s.scan_type === 'entry').length,
      exits: scans.filter((s) => s.scan_type === 'exit').length,
      inside: (insideQuery.data || []).length,
      pending: (pendingExitsQuery.data || []).length,
    };
  }, [scansQuery.data, insideQuery.data, pendingExitsQuery.data, shiftStart]);

  const submit = useMutation({
    mutationFn: () =>
      entities.ShiftHandover.create({
        officer_name: user.full_name || user.email,
        officer_email: user.email,
        facility_id: user.assigned_facility_id || 'all',
        shift_start: shiftStart.toISOString(),
        shift_end: new Date().toISOString(),
        total_entries: stats.entries,
        total_exits: stats.exits,
        vehicles_inside: stats.inside,
        pending_exits: stats.pending,
        notes,
        next_officer_name: nextOfficerName,
        next_officer_email: nextOfficerEmail,
        status: 'sent',
      }),
    onSuccess: () => {
      Alert.alert('Handover sent', 'Your shift handover has been recorded.');
      setNextOfficerName('');
      setNextOfficerEmail('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
    },
    onError: (err) => Alert.alert('Handover failed', err.message),
  });

  const refreshing = scansQuery.isFetching || insideQuery.isFetching || pendingExitsQuery.isFetching || handoversQuery.isFetching;
  const refetchAll = () => {
    scansQuery.refetch();
    insideQuery.refetch();
    pendingExitsQuery.refetch();
    handoversQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refetchAll}>
      <Select
        label="Shift duration"
        value={hours}
        options={DURATIONS}
        onChange={setHours}
      />

      <Row style={{ marginBottom: spacing.md }}>
        <StatCard label="Entries" value={stats.entries} icon="log-in-outline" color={colors.success} />
        <StatCard label="Exits" value={stats.exits} icon="log-out-outline" color={colors.info} />
      </Row>
      <Row style={{ marginBottom: spacing.md }}>
        <StatCard label="Inside" value={stats.inside} icon="car-outline" color={colors.primary} />
        <StatCard label="Pending exits" value={stats.pending} icon="hourglass-outline" color={colors.warning} />
      </Row>

      <Card>
        <SectionTitle style={{ marginTop: 0 }}>Hand over to</SectionTitle>
        <Input
          label="Next officer name"
          placeholder="e.g. John Okafor"
          value={nextOfficerName}
          onChangeText={setNextOfficerName}
        />
        <Input
          label="Next officer email"
          placeholder="officer@example.com"
          value={nextOfficerEmail}
          onChangeText={setNextOfficerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Notes"
          placeholder="Anything the next officer should know..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        <Button
          title="Send Handover"
          icon="send-outline"
          loading={submit.isPending}
          onPress={() => submit.mutate()}
        />
      </Card>

      <SectionTitle>Recent Handovers</SectionTitle>
      {(handoversQuery.data || []).map((h) => (
        <Card key={h.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 }}>
              {h.officer_name} {'->'} {h.next_officer_name || '—'}
            </Text>
            <Badge label={h.status} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 4 }}>{timeAgo(h.created_date)}</Text>
        </Card>
      ))}
      {!handoversQuery.isLoading && (handoversQuery.data || []).length === 0 ? (
        <EmptyState icon="swap-horizontal-outline" title="No handovers yet" />
      ) : null}
    </Screen>
  );
}
