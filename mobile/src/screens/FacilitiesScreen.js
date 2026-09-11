import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, stats } from '../api/client';
import { Screen, Card, Button, Badge, Input, Select, Row, EmptyState, SectionTitle } from '../components/ui';
import { colors, spacing, formatNaira } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

const BILLING_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'standard', label: 'Standard (flat rate)' },
  { value: 'hourly', label: 'Hourly' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const emptyForm = () => ({
  name: '',
  address: '',
  city: '',
  capacity: '',
  billing_mode: 'free',
  hourly_rate: '',
  standard_rate: '',
  exit_timeout_minutes: '',
  contact_phone: '',
  contact_email: '',
  status: 'active',
});

const toForm = (f) => ({
  name: f.name || '',
  address: f.address || '',
  city: f.city || '',
  capacity: f.capacity != null ? String(f.capacity) : '',
  billing_mode: f.billing_mode || 'free',
  hourly_rate: f.hourly_rate != null ? String(f.hourly_rate) : '',
  standard_rate: f.standard_rate != null ? String(f.standard_rate) : '',
  exit_timeout_minutes: f.exit_timeout_minutes != null ? String(f.exit_timeout_minutes) : '',
  contact_phone: f.contact_phone || '',
  contact_email: f.contact_email || '',
  status: f.status || 'active',
});

const num = (v) => (v === '' || v == null ? undefined : Number(v));

function FacilityForm({ form, setForm, onSave, saving, onDelete, deleting }) {
  return (
    <View>
      <Input label="Name *" value={form.name} onChangeText={(v) => setForm((s) => ({ ...s, name: v }))} placeholder="Facility name" />
      <Input label="Address" value={form.address} onChangeText={(v) => setForm((s) => ({ ...s, address: v }))} placeholder="Street address" />
      <Input label="City" value={form.city} onChangeText={(v) => setForm((s) => ({ ...s, city: v }))} placeholder="City" />
      <Input label="Capacity" value={form.capacity} onChangeText={(v) => setForm((s) => ({ ...s, capacity: v }))} keyboardType="numeric" placeholder="e.g. 200" />
      <Select label="Billing mode" value={form.billing_mode} options={BILLING_OPTIONS} onChange={(v) => setForm((s) => ({ ...s, billing_mode: v }))} />
      {form.billing_mode === 'hourly' ? (
        <Input label="Hourly rate (₦)" value={form.hourly_rate} onChangeText={(v) => setForm((s) => ({ ...s, hourly_rate: v }))} keyboardType="numeric" placeholder="e.g. 500" />
      ) : null}
      {form.billing_mode === 'standard' ? (
        <Input label="Standard rate (₦)" value={form.standard_rate} onChangeText={(v) => setForm((s) => ({ ...s, standard_rate: v }))} keyboardType="numeric" placeholder="e.g. 1000" />
      ) : null}
      <Input label="Exit timeout (minutes)" value={form.exit_timeout_minutes} onChangeText={(v) => setForm((s) => ({ ...s, exit_timeout_minutes: v }))} keyboardType="numeric" placeholder="e.g. 15" />
      <Input label="Contact phone" value={form.contact_phone} onChangeText={(v) => setForm((s) => ({ ...s, contact_phone: v }))} keyboardType="phone-pad" placeholder="0800 000 0000" />
      <Input label="Contact email" value={form.contact_email} onChangeText={(v) => setForm((s) => ({ ...s, contact_email: v }))} keyboardType="email-address" autoCapitalize="none" placeholder="contact@example.com" />
      <Select label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => setForm((s) => ({ ...s, status: v }))} />
      <Button title="Save" icon="save" loading={saving} onPress={onSave} />
      {onDelete ? (
        <Button title="Delete Facility" icon="trash" variant="danger" small style={{ marginTop: spacing.sm }} loading={deleting} onPress={onDelete} />
      ) : null}
    </View>
  );
}

export default function FacilitiesScreen() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const query = useQuery({
    queryKey: ['facilityStats'],
    queryFn: () => stats.facilities(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['facilityStats'] });
    queryClient.invalidateQueries({ queryKey: ['facilities'] });
  };

  const payload = () => ({
    name: form.name.trim(),
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    capacity: num(form.capacity),
    billing_mode: form.billing_mode,
    hourly_rate: num(form.hourly_rate),
    standard_rate: num(form.standard_rate),
    exit_timeout_minutes: num(form.exit_timeout_minutes),
    contact_phone: form.contact_phone.trim() || undefined,
    contact_email: form.contact_email.trim() || undefined,
    status: form.status,
  });

  const createFacility = useMutation({
    mutationFn: (data) => entities.Facility.create(data),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm(emptyForm());
      Alert.alert('Facility created', 'The facility was added successfully.');
    },
    onError: (err) => Alert.alert('Create failed', err.message),
  });

  const updateFacility = useMutation({
    mutationFn: ({ id, data }) => entities.Facility.update(id, data),
    onSuccess: () => {
      invalidate();
      setExpandedId(null);
      Alert.alert('Saved', 'Facility updated successfully.');
    },
    onError: (err) => Alert.alert('Update failed', err.message),
  });

  const deleteFacility = useMutation({
    mutationFn: (id) => entities.Facility.delete(id),
    onSuccess: () => {
      invalidate();
      setExpandedId(null);
    },
    onError: (err) => Alert.alert('Delete failed', err.message),
  });

  const validateAndSave = (onValid) => {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Facility name is required.');
      return;
    }
    onValid();
  };

  const confirmDelete = (f) =>
    Alert.alert('Delete facility?', `${f.name} and its configuration will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFacility.mutate(f.id) },
    ]);

  const openEdit = (f) => {
    if (expandedId === f.id) {
      setExpandedId(null);
      return;
    }
    setForm(toForm(f));
    setShowCreate(false);
    setExpandedId(f.id);
  };

  const rateText = (f) => {
    if (f.billing_mode === 'hourly') return `${formatNaira(f.hourly_rate)}/hr`;
    if (f.billing_mode === 'standard') return `${formatNaira(f.standard_rate)} flat`;
    return 'Free';
  };

  const facilities = query.data || [];

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      {isSuperAdmin ? (
        <Button
          title={showCreate ? 'Cancel' : 'Add Facility'}
          icon={showCreate ? 'close' : 'add'}
          variant={showCreate ? 'secondary' : 'primary'}
          onPress={() => {
            if (!showCreate) {
              setForm(emptyForm());
              setExpandedId(null);
            }
            setShowCreate((v) => !v);
          }}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}

      {isSuperAdmin && showCreate ? (
        <Card>
          <SectionTitle>New facility</SectionTitle>
          <FacilityForm
            form={form}
            setForm={setForm}
            saving={createFacility.isPending}
            onSave={() => validateAndSave(() => createFacility.mutate(payload()))}
          />
        </Card>
      ) : null}

      {facilities.map((f) => (
        <Card key={f.id} onPress={isSuperAdmin ? () => openEdit(f) : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, flexShrink: 1 }}>{f.name}</Text>
            <Badge label={f.status || 'active'} />
          </View>
          {f.city || f.address ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {[f.address, f.city].filter(Boolean).join(', ')}
            </Text>
          ) : null}
          <Row style={{ marginTop: spacing.sm, alignItems: 'center' }}>
            <Badge label={f.billing_mode || 'free'} status={f.billing_mode === 'free' ? 'inactive' : 'assigned'} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>{rateText(f)}</Text>
          </Row>
          <Row style={{ marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{f.stats?.vehicles ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight }}>Vehicles</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{f.stats?.inside ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight }}>Inside</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{f.stats?.pending_exits ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight }}>Pending exits</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.success }}>{formatNaira(f.stats?.revenue)}</Text>
              <Text style={{ fontSize: 11, color: colors.textLight }}>Revenue</Text>
            </View>
          </Row>

          {isSuperAdmin && expandedId === f.id ? (
            <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
              <FacilityForm
                form={form}
                setForm={setForm}
                saving={updateFacility.isPending}
                onSave={() => validateAndSave(() => updateFacility.mutate({ id: f.id, data: payload() }))}
                deleting={deleteFacility.isPending && deleteFacility.variables === f.id}
                onDelete={() => confirmDelete(f)}
              />
            </View>
          ) : null}
        </Card>
      ))}

      {facilities.length === 0 && !query.isFetching ? (
        <EmptyState icon="business-outline" title="No facilities yet" subtitle={isSuperAdmin ? 'Add your first facility to get started.' : undefined} />
      ) : null}
    </Screen>
  );
}
