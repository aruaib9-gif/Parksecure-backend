import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { entities, functions } from '../api/client';
import { Screen, Card, Button, Badge, Input, Select, Row, EmptyState, Loading, SectionTitle } from '../components/ui';
import { colors, spacing } from '../lib/theme';

const CODE_TYPE_OPTIONS = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'guest', label: 'Guest' },
];

export default function QRCodesScreen() {
  const queryClient = useQueryClient();
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    facility_id: '',
    batch_name: '',
    count: '',
    code_type: 'permanent',
    guest_duration_hours: '24',
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const codesQuery = useQuery({
    queryKey: ['qrcodes'],
    queryFn: () => entities.QRCode.list({ limit: 500 }),
  });
  const facilitiesQuery = useQuery({
    queryKey: ['facilities'],
    queryFn: () => entities.Facility.list(),
  });

  const facilityName = (id) =>
    (facilitiesQuery.data || []).find((f) => f.id === id)?.name || '—';
  const facilityOptions = (facilitiesQuery.data || []).map((f) => ({ value: f.id, label: f.name }));

  const batches = useMemo(() => {
    const groups = {};
    for (const code of codesQuery.data || []) {
      const key = code.batch_name || 'Unbatched';
      if (!groups[key]) groups[key] = [];
      groups[key].push(code);
    }
    return Object.entries(groups).map(([name, codes]) => {
      const sorted = [...codes].sort((a, b) => String(a.code_id).localeCompare(String(b.code_id)));
      const counts = { available: 0, assigned: 0, deactivated: 0 };
      for (const c of codes) if (counts[c.status] !== undefined) counts[c.status] += 1;
      return {
        name,
        codes: sorted,
        counts,
        facility_id: codes[0]?.facility_id,
        code_type: codes[0]?.code_type,
        first: sorted[0]?.code_id,
        last: sorted[sorted.length - 1]?.code_id,
      };
    });
  }, [codesQuery.data]);

  const generate = useMutation({
    mutationFn: (payload) => functions.generateQRBatch(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qrcodes'] });
      setShowForm(false);
      setForm({ facility_id: '', batch_name: '', count: '', code_type: 'permanent', guest_duration_hours: '24' });
      Alert.alert('Batch generated', 'The QR code batch was created.');
    },
    onError: (err) => Alert.alert('Generation failed', err.message),
  });

  const deactivate = useMutation({
    mutationFn: (id) => entities.QRCode.update(id, { status: 'deactivated' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qrcodes'] }),
    onError: (err) => Alert.alert('Deactivation failed', err.message),
  });

  const onSubmitBatch = () => {
    const count = parseInt(form.count, 10);
    if (!form.facility_id) return Alert.alert('Missing facility', 'Select a facility for this batch.');
    if (!form.batch_name.trim()) return Alert.alert('Missing name', 'Enter a batch name.');
    if (!count || count < 1 || count > 500) return Alert.alert('Invalid count', 'Count must be between 1 and 500.');
    const payload = {
      facility_id: form.facility_id,
      batch_name: form.batch_name.trim(),
      count,
      code_type: form.code_type,
    };
    if (form.code_type === 'guest') {
      payload.guest_duration_hours = parseInt(form.guest_duration_hours, 10) || 24;
    }
    generate.mutate(payload);
  };

  const onLongPressCode = (code) => {
    if (code.status === 'deactivated') return;
    Alert.alert('Deactivate code?', `${code.code_id} will no longer be usable.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => deactivate.mutate(code.id) },
    ]);
  };

  if (codesQuery.isLoading || facilitiesQuery.isLoading) return <Loading />;

  return (
    <Screen refreshing={codesQuery.isFetching} onRefresh={codesQuery.refetch}>
      <Row style={{ marginBottom: spacing.md, alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.text }}>
          QR Batches ({batches.length})
        </Text>
        <Button
          title={showForm ? 'Cancel' : 'Generate Batch'}
          icon={showForm ? 'close' : 'add'}
          small
          variant={showForm ? 'secondary' : 'primary'}
          onPress={() => setShowForm((s) => !s)}
        />
      </Row>

      {showForm ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <SectionTitle>New Batch</SectionTitle>
          <Select
            label="Facility"
            value={form.facility_id}
            options={facilityOptions}
            onChange={(v) => set('facility_id', v)}
            placeholder="Select facility..."
          />
          <Input
            label="Batch Name"
            placeholder="e.g. July 2026 Stickers"
            value={form.batch_name}
            onChangeText={(v) => set('batch_name', v)}
          />
          <Input
            label="Count (max 500)"
            placeholder="e.g. 100"
            value={form.count}
            onChangeText={(v) => set('count', v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
          <Select
            label="Code Type"
            value={form.code_type}
            options={CODE_TYPE_OPTIONS}
            onChange={(v) => set('code_type', v)}
          />
          {form.code_type === 'guest' ? (
            <Input
              label="Guest Duration (hours)"
              placeholder="24"
              value={form.guest_duration_hours}
              onChangeText={(v) => set('guest_duration_hours', v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          ) : null}
          <Button title="Generate" icon="qr-code-outline" loading={generate.isPending} onPress={onSubmitBatch} />
        </Card>
      ) : null}

      {batches.map((batch) => {
        const expanded = expandedBatch === batch.name;
        return (
          <Card key={batch.name} onPress={() => setExpandedBatch(expanded ? null : batch.name)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 }}>
                {batch.name}
              </Text>
              {batch.code_type ? <Badge label={batch.code_type} /> : null}
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
                style={{ marginLeft: 6 }}
              />
            </View>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {facilityName(batch.facility_id)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>
              {batch.first} – {batch.last} · {batch.codes.length} codes
            </Text>
            <Row style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              <Badge label={`${batch.counts.available} available`} status="available" />
              <Badge label={`${batch.counts.assigned} assigned`} status="assigned" />
              {batch.counts.deactivated > 0 ? (
                <Badge label={`${batch.counts.deactivated} deactivated`} status="deactivated" />
              ) : null}
            </Row>

            {expanded ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg }}>
                {batch.codes.map((code) => (
                  <TouchableOpacity
                    key={code.id}
                    activeOpacity={0.7}
                    onLongPress={() => onLongPressCode(code)}
                    style={{ alignItems: 'center', width: 96 }}
                  >
                    <View style={{ opacity: code.status === 'deactivated' ? 0.35 : 1 }}>
                      <QRCode value={code.code_id} size={72} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text, marginTop: 4 }} numberOfLines={1}>
                      {code.code_id}
                    </Text>
                    <Badge label={code.status} style={{ marginTop: 2 }} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}

      {batches.length === 0 ? (
        <EmptyState
          icon="qr-code-outline"
          title="No QR codes yet"
          subtitle="Generate a batch to print stickers for vehicles."
        />
      ) : null}
    </Screen>
  );
}
