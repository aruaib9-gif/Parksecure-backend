import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { entities } from '../api/client';
import { Screen, Card, Button, Badge, Input, Row, EmptyState } from '../components/ui';
import { colors, spacing, timeAgo } from '../lib/theme';

const FILTERS = ['all', 'entry', 'exit'];

export default function ItemsLogScreen() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['itemLogs'],
    queryFn: () => entities.ItemLog.list({ limit: 200, sort: '-created_date' }),
  });

  const items = useMemo(() => {
    let all = query.data || [];
    if (filter !== 'all') all = all.filter((i) => i.scan_type === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      all = all.filter(
        (i) =>
          (i.item_name || '').toLowerCase().includes(q) ||
          (i.plate_number || '').toLowerCase().includes(q)
      );
    }
    return all;
  }, [query.data, filter, search]);

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

      <Input
        placeholder="Search by item or plate number..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {items.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 }}>
              {item.item_name || 'Item'} × {item.quantity ?? 1}
            </Text>
            <Badge label={item.scan_type} />
          </View>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
            {[item.plate_number, item.driver_name || item.owner_name].filter(Boolean).join(' · ') || '—'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>{timeAgo(item.created_date)}</Text>
          {item.discrepancy_note ? (
            <Text style={{ fontSize: 13, color: colors.danger, marginTop: spacing.sm }}>{item.discrepancy_note}</Text>
          ) : null}
          {item.verified_on_exit === false ? (
            <Badge label="unverified" status="pending" style={{ marginTop: spacing.sm }} />
          ) : null}
        </Card>
      ))}

      {!query.isLoading && items.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="No item logs"
          subtitle={search ? 'No items match your search.' : 'Logged items will appear here.'}
        />
      ) : null}
    </Screen>
  );
}
