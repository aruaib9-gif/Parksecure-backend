import React from 'react';
import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, exits } from '../api/client';
import { Screen, Card, Button, Badge, Row, SectionTitle, EmptyState } from '../components/ui';
import { colors, spacing, formatDate, timeAgo } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

export default function OwnerHomeScreen({ navigation }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ['ownerPendingExits'],
    queryFn: () => entities.ExitRequest.filter({ status: 'pending' }),
    refetchInterval: 8000,
  });

  const vehiclesQuery = useQuery({
    queryKey: ['ownerVehicles'],
    queryFn: () => entities.Vehicle.list(),
  });

  const activityQuery = useQuery({
    queryKey: ['ownerScanLogs'],
    queryFn: () => entities.ScanLog.list({ limit: 10 }),
  });

  const respond = useMutation({
    mutationFn: ({ id, action }) => exits.respond(id, action),
    onSuccess: (_data, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['ownerPendingExits'] });
      queryClient.invalidateQueries({ queryKey: ['ownerExitRequests'] });
      if (action === 'approve') Alert.alert('Approved', 'Exit request approved. The gate has been notified.');
    },
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const refreshing = pendingQuery.isFetching || vehiclesQuery.isFetching || activityQuery.isFetching;
  const onRefresh = () => {
    pendingQuery.refetch();
    vehiclesQuery.refetch();
    activityQuery.refetch();
  };

  const pending = pendingQuery.data || [];
  const vehicles = vehiclesQuery.data || [];
  const activity = activityQuery.data || [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
        Hello, {user?.full_name || user?.email || 'there'}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg }}>
        Your vehicles at a glance
      </Text>

      {pending.length > 0 ? (
        <Card style={{ borderColor: colors.warning, backgroundColor: colors.warningBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Ionicons name="alert-circle" size={20} color={colors.warning} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.warning }}>Exit approval needed</Text>
          </View>
          {pending.map((req) => (
            <View key={req.id} style={{ marginBottom: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{req.plate_number || 'Unknown'}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>
                Requested by {req.requested_by || 'gate security'} · {timeAgo(req.created_date)}
              </Text>
              <Row>
                <Button
                  title="Approve"
                  icon="checkmark"
                  variant="success"
                  small
                  style={{ flex: 1 }}
                  loading={respond.isPending && respond.variables?.id === req.id && respond.variables?.action === 'approve'}
                  onPress={() => respond.mutate({ id: req.id, action: 'approve' })}
                />
                <Button
                  title="Reject"
                  icon="close"
                  variant="danger"
                  small
                  style={{ flex: 1 }}
                  loading={respond.isPending && respond.variables?.id === req.id && respond.variables?.action === 'reject'}
                  onPress={() =>
                    Alert.alert('Reject exit?', `${req.plate_number || 'This vehicle'} will be denied exit.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reject', style: 'destructive', onPress: () => respond.mutate({ id: req.id, action: 'reject' }) },
                    ])
                  }
                />
              </Row>
            </View>
          ))}
        </Card>
      ) : null}

      <SectionTitle>My Vehicles</SectionTitle>
      {vehicles.map((v) => (
        <Card key={v.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{v.plate_number}</Text>
            <Badge label={v.status} />
          </View>
          {v.make_model ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {v.make_model}{v.color ? ` · ${v.color}` : ''}
            </Text>
          ) : null}
          <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap', gap: spacing.sm }}>
            {v.registration_type ? <Badge label={v.registration_type} status={v.registration_type} /> : null}
            {v.is_inside ? <Badge label="Inside facility" status="active" /> : null}
          </Row>
          {v.is_inside && v.last_entry ? (
            <Text style={{ fontSize: 12, color: colors.success, marginTop: 4 }}>
              Entered {formatDate(v.last_entry)}
            </Text>
          ) : null}
          {v.registration_type === 'guest' && v.guest_pass_expires ? (
            <Text style={{ fontSize: 12, color: colors.warning, marginTop: 4 }}>
              Guest pass expires {formatDate(v.guest_pass_expires)}
            </Text>
          ) : null}
          {v.qr_code_id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
              <Ionicons name="qr-code-outline" size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={{ fontSize: 12, color: colors.textMuted }}>QR: {v.qr_code_id}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textLight} style={{ marginRight: 5 }} />
              <Text style={{ fontSize: 12, color: colors.textLight, fontStyle: 'italic' }}>
                Ask facility staff to assign a QR code
              </Text>
            </View>
          )}
        </Card>
      ))}
      {!vehiclesQuery.isLoading && vehicles.length === 0 ? (
        <EmptyState icon="car-outline" title="No vehicles yet" subtitle="Register your vehicle to get started." />
      ) : null}
      <Button
        title="Register a Vehicle"
        icon="add-circle-outline"
        onPress={() => navigation.navigate('OwnerVehicleForm')}
        style={{ marginBottom: spacing.lg }}
      />

      <SectionTitle>Recent Activity</SectionTitle>
      {activity.map((log) => (
        <Card key={log.id} style={{ paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label={log.scan_type} status={log.scan_type} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{log.plate_number}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textLight }}>{timeAgo(log.created_date)}</Text>
          </View>
        </Card>
      ))}
      {!activityQuery.isLoading && activity.length === 0 ? (
        <EmptyState icon="time-outline" title="No recent activity" />
      ) : null}
    </Screen>
  );
}
