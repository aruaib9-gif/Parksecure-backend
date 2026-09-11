import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { entities } from '../api/client';
import { Screen, Card, Button, Badge, Input, Row, EmptyState, Loading } from '../components/ui';
import { colors, spacing } from '../lib/theme';

const FILTERS = ['all', 'active', 'blacklisted', 'inside'];

export default function VehiclesScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const query = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => entities.Vehicle.list({ limit: 200 }),
  });

  const vehicles = useMemo(() => {
    let list = query.data || [];
    if (filter === 'active') list = list.filter((v) => v.status === 'active');
    else if (filter === 'blacklisted') list = list.filter((v) => v.status === 'blacklisted');
    else if (filter === 'inside') list = list.filter((v) => v.is_inside);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        [v.plate_number, v.owner_name, v.qr_code_id]
          .some((field) => String(field || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [query.data, filter, search]);

  if (query.isLoading) return <Loading />;

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      <Row style={{ marginBottom: spacing.md, alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.text }}>
          Vehicles ({vehicles.length})
        </Text>
        <Button
          title="Add Vehicle"
          icon="add"
          small
          onPress={() => navigation.navigate('VehicleForm', {})}
        />
      </Row>

      <Input
        placeholder="Search plate, owner or QR code..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

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

      {vehicles.map((vehicle) => (
        <Card key={vehicle.id} onPress={() => navigation.navigate('VehicleForm', { vehicle })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>
              {vehicle.plate_number}
            </Text>
            <Row style={{ gap: spacing.xs }}>
              {vehicle.is_inside ? <Badge label="inside" status="approved" /> : null}
              <Badge label={vehicle.status} />
            </Row>
          </View>
          {vehicle.owner_name ? (
            <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
              {vehicle.owner_name}
            </Text>
          ) : null}
          {vehicle.make_model ? (
            <Text style={{ fontSize: 13, color: colors.textLight, marginTop: 2 }}>
              {vehicle.make_model}
            </Text>
          ) : null}
          {vehicle.qr_code_id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Ionicons name="qr-code-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>
                {vehicle.qr_code_id}
              </Text>
            </View>
          ) : null}
        </Card>
      ))}

      {vehicles.length === 0 ? (
        <EmptyState
          icon="car-outline"
          title="No vehicles found"
          subtitle={search ? 'Try a different search.' : 'Add a vehicle to get started.'}
        />
      ) : null}
    </Screen>
  );
}
