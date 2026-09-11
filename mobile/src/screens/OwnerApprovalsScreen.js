import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, exits } from '../api/client';
import { Screen, Card, Button, Badge, Row, EmptyState, KeyValue } from '../components/ui';
import { colors, spacing, formatNaira, timeAgo } from '../lib/theme';

const FILTERS = ['pending', 'approved', 'rejected', 'all'];

const formatDuration = (mins) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

export default function OwnerApprovalsScreen() {
  const [filter, setFilter] = useState('pending');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ownerExitRequests'],
    queryFn: () => entities.ExitRequest.list({ limit: 100 }),
    refetchInterval: 8000,
  });

  const respond = useMutation({
    mutationFn: ({ id, action }) => exits.respond(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerExitRequests'] });
      queryClient.invalidateQueries({ queryKey: ['ownerPendingExits'] });
    },
    onError: (err) => Alert.alert('Action failed', err.message),
  });

  const requests = (query.data || []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
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

      {requests.map((req) => (
        <Card key={req.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{req.plate_number || 'Unknown'}</Text>
            <Badge label={req.status} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textLight, marginBottom: spacing.sm }}>{timeAgo(req.created_date)}</Text>
          {req.requested_by ? <KeyValue label="Requested by" value={req.requested_by} /> : null}
          {req.duration_minutes ? <KeyValue label="Parked for" value={formatDuration(req.duration_minutes)} /> : null}
          {req.billing_amount > 0 ? <KeyValue label="Fee" value={formatNaira(req.billing_amount)} /> : null}
          {req.notes ? <KeyValue label="Notes" value={req.notes} /> : null}
          {req.status === 'pending' ? (
            <Row style={{ marginTop: spacing.md }}>
              <Button
                title="Approve"
                icon="checkmark"
                variant="success"
                style={{ flex: 1 }}
                loading={respond.isPending && respond.variables?.id === req.id && respond.variables?.action === 'approve'}
                onPress={() => respond.mutate({ id: req.id, action: 'approve' })}
              />
              <Button
                title="Reject"
                icon="close"
                variant="danger"
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
          ) : null}
        </Card>
      ))}

      {!query.isLoading && requests.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={`No ${filter === 'all' ? '' : filter} exit requests`}
          subtitle="Requests to release your vehicles will appear here."
        />
      ) : null}
    </Screen>
  );
}
