import React, { useState } from 'react';
import { View, Text, Alert, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { users, entities } from '../api/client';
import { Screen, Card, Button, Badge, Input, Select, Row, EmptyState, SectionTitle } from '../components/ui';
import { colors, spacing, roleLabels, timeAgo } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

const ROLE_FILTERS = ['all', 'security', 'facility_admin', 'park_admin', 'vehicle_owner'];
const ROLE_OPTIONS = ['security', 'facility_admin', 'park_admin', 'vehicle_owner'].map((r) => ({
  value: r,
  label: roleLabels[r] || r,
}));

const EMPTY_FORM = { email: '', full_name: '', phone: '', role: 'security', assigned_facility_id: null };

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export default function UsersScreen() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);

  const query = useQuery({
    queryKey: ['users', filter],
    queryFn: () => users.list(filter === 'all' ? undefined : { role: filter }),
  });

  const facilitiesQuery = useQuery({
    queryKey: ['facilities'],
    queryFn: () => entities.Facility.list(),
  });

  const facilityName = (id) => {
    if (!id) return null;
    const fac = (facilitiesQuery.data || []).find((f) => f.id === id);
    return fac ? fac.name : null;
  };

  const facilityOptions = [
    { value: null, label: 'No facility' },
    ...(facilitiesQuery.data || []).map((f) => ({ value: f.id, label: f.name })),
  ];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createUser = useMutation({
    mutationFn: (data) => users.create(data),
    onSuccess: (res) => {
      invalidate();
      setShowCreate(false);
      setForm(EMPTY_FORM);
      if (res?.temp_password) {
        Alert.alert(
          'Staff created',
          `Temporary password: ${res.temp_password}\n\nShare it with the user securely — it will not be shown again.`
        );
      } else {
        Alert.alert('Staff created', 'The account was created successfully.');
      }
    },
    onError: (err) => Alert.alert('Create failed', err.message),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }) => users.update(id, data),
    onSuccess: (_res, vars) => {
      invalidate();
      if (vars.data.password) {
        Alert.alert(
          'Password reset',
          `New password: ${vars.data.password}\n\nShare it with the user securely — it will not be shown again.`
        );
      }
    },
    onError: (err) => Alert.alert('Update failed', err.message),
  });

  const deleteUser = useMutation({
    mutationFn: (id) => users.delete(id),
    onSuccess: () => {
      invalidate();
      setExpandedId(null);
    },
    onError: (err) => Alert.alert('Delete failed', err.message),
  });

  const submitCreate = () => {
    if (!form.email.trim()) {
      Alert.alert('Missing email', 'Email is required.');
      return;
    }
    createUser.mutate({
      email: form.email.trim(),
      full_name: form.full_name.trim() || undefined,
      phone: form.phone.trim() || undefined,
      role: form.role,
      assigned_facility_id: form.assigned_facility_id || undefined,
    });
  };

  const confirmDelete = (u) =>
    Alert.alert('Delete user?', `${u.full_name || u.email} will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteUser.mutate(u.id) },
    ]);

  const resetPassword = (u) => {
    const password = generatePassword();
    Alert.alert('Reset password?', `A new password will be generated for ${u.full_name || u.email}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => updateUser.mutate({ id: u.id, data: { password } }) },
    ]);
  };

  return (
    <Screen refreshing={query.isFetching} onRefresh={query.refetch}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        <Row style={{ gap: spacing.sm }}>
          {ROLE_FILTERS.map((f) => (
            <Button
              key={f}
              title={f === 'all' ? 'All' : roleLabels[f] || f}
              small
              variant={filter === f ? 'primary' : 'secondary'}
              onPress={() => setFilter(f)}
            />
          ))}
        </Row>
      </ScrollView>

      {isAdmin ? (
        <Button
          title={showCreate ? 'Cancel' : 'Add Staff'}
          icon={showCreate ? 'close' : 'person-add'}
          variant={showCreate ? 'secondary' : 'primary'}
          onPress={() => setShowCreate((v) => !v)}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}

      {isAdmin && showCreate ? (
        <Card>
          <SectionTitle>New staff account</SectionTitle>
          <Input
            label="Email *"
            value={form.email}
            onChangeText={(v) => setForm((s) => ({ ...s, email: v }))}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="user@example.com"
          />
          <Input
            label="Full name"
            value={form.full_name}
            onChangeText={(v) => setForm((s) => ({ ...s, full_name: v }))}
            placeholder="Full name"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChangeText={(v) => setForm((s) => ({ ...s, phone: v }))}
            keyboardType="phone-pad"
            placeholder="0800 000 0000"
          />
          <Select
            label="Role"
            value={form.role}
            options={ROLE_OPTIONS}
            onChange={(v) => setForm((s) => ({ ...s, role: v }))}
          />
          <Select
            label="Facility (optional)"
            value={form.assigned_facility_id}
            options={facilityOptions}
            onChange={(v) => setForm((s) => ({ ...s, assigned_facility_id: v }))}
          />
          <Button title="Create Account" icon="checkmark" loading={createUser.isPending} onPress={submitCreate} />
        </Card>
      ) : null}

      {(query.data || []).map((u) => {
        const expanded = expandedId === u.id;
        return (
          <Card key={u.id} onPress={isAdmin ? () => setExpandedId(expanded ? null : u.id) : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 }}>
                {u.full_name || u.email}
              </Text>
              <Badge label={roleLabels[u.role] || u.role} />
            </View>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{u.email}</Text>
            <Row style={{ marginTop: spacing.sm, gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
              {facilityName(u.assigned_facility_id) ? (
                <Text style={{ fontSize: 12, color: colors.textLight }}>
                  {facilityName(u.assigned_facility_id)}
                </Text>
              ) : null}
              {u.is_active === false ? <Badge label="disabled" status="deactivated" /> : null}
              {u.created_date ? (
                <Text style={{ fontSize: 12, color: colors.textLight }}>Joined {timeAgo(u.created_date)}</Text>
              ) : null}
            </Row>

            {isAdmin && expanded ? (
              <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                <Select
                  label="Change role"
                  value={u.role}
                  options={ROLE_OPTIONS}
                  onChange={(v) => updateUser.mutate({ id: u.id, data: { role: v } })}
                />
                <Select
                  label="Change facility"
                  value={u.assigned_facility_id || null}
                  options={facilityOptions}
                  onChange={(v) => updateUser.mutate({ id: u.id, data: { assigned_facility_id: v } })}
                />
                <Row>
                  <Button
                    title={u.is_active === false ? 'Activate' : 'Deactivate'}
                    icon={u.is_active === false ? 'checkmark-circle' : 'ban'}
                    variant={u.is_active === false ? 'success' : 'secondary'}
                    small
                    style={{ flex: 1 }}
                    loading={updateUser.isPending && updateUser.variables?.id === u.id && updateUser.variables?.data?.is_active !== undefined}
                    onPress={() => updateUser.mutate({ id: u.id, data: { is_active: !(u.is_active !== false) } })}
                  />
                  <Button
                    title="Reset Password"
                    icon="key"
                    variant="secondary"
                    small
                    style={{ flex: 1 }}
                    onPress={() => resetPassword(u)}
                  />
                </Row>
                <Button
                  title="Delete"
                  icon="trash"
                  variant="danger"
                  small
                  style={{ marginTop: spacing.sm }}
                  loading={deleteUser.isPending && deleteUser.variables === u.id}
                  onPress={() => confirmDelete(u)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      {query.data?.length === 0 ? (
        <EmptyState icon="people-outline" title="No users found" subtitle="Try a different role filter." />
      ) : null}
    </Screen>
  );
}
