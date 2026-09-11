import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, functions } from '../api/client';
import { Screen, Card, Button, Input, Select, SectionTitle, KeyValue } from '../components/ui';
import { spacing } from '../lib/theme';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'blacklisted', label: 'Blacklisted' },
  { value: 'suspended', label: 'Suspended' },
];

const REGISTRATION_OPTIONS = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'guest', label: 'Guest' },
];

export default function VehicleFormScreen({ navigation, route }) {
  const vehicle = route.params?.vehicle;
  const isEdit = !!vehicle?.id;
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    plate_number: vehicle?.plate_number || '',
    owner_name: vehicle?.owner_name || '',
    owner_email: vehicle?.owner_email || '',
    owner_phone: vehicle?.owner_phone || '',
    make_model: vehicle?.make_model || '',
    color: vehicle?.color || '',
    driver_name: vehicle?.driver_name || '',
    driver_phone: vehicle?.driver_phone || '',
    notes: vehicle?.notes || '',
    facility_id: vehicle?.facility_id || '',
    status: vehicle?.status || 'active',
    registration_type: vehicle?.registration_type || 'permanent',
  });
  const [qrInput, setQrInput] = useState('');

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const facilitiesQuery = useQuery({
    queryKey: ['facilities'],
    queryFn: () => entities.Facility.list(),
  });
  const facilityOptions = (facilitiesQuery.data || []).map((f) => ({ value: f.id, label: f.name }));

  const save = useMutation({
    mutationFn: (data) =>
      isEdit ? entities.Vehicle.update(vehicle.id, data) : entities.Vehicle.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      Alert.alert('Saved', isEdit ? 'Vehicle updated.' : 'Vehicle created.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert('Save failed', err.message),
  });

  const assignQR = useMutation({
    mutationFn: (code) => functions.assignQRCode(vehicle.id, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['qrcodes'] });
      Alert.alert('QR assigned', `Code ${qrInput.trim()} assigned to ${form.plate_number}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert('Assign failed', err.message),
  });

  const invite = useMutation({
    mutationFn: () =>
      functions.sendInviteEmail({
        email: form.owner_email,
        full_name: form.owner_name,
        plate_number: form.plate_number,
      }),
    onSuccess: () => Alert.alert('Invite sent', `An invite email was sent to ${form.owner_email}.`),
    onError: (err) => Alert.alert('Invite failed', err.message),
  });

  const remove = useMutation({
    mutationFn: () => entities.Vehicle.delete(vehicle.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Delete failed', err.message),
  });

  const onSave = () => {
    if (!form.plate_number.trim()) {
      Alert.alert('Missing plate number', 'Plate number is required.');
      return;
    }
    save.mutate({ ...form, plate_number: form.plate_number.trim().toUpperCase() });
  };

  const confirmDelete = () =>
    Alert.alert('Delete vehicle?', `${vehicle.plate_number} will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <Screen>
      <SectionTitle>{isEdit ? 'Edit Vehicle' : 'New Vehicle'}</SectionTitle>

      <Input
        label="Plate Number *"
        placeholder="e.g. ABC-123-XY"
        value={form.plate_number}
        onChangeText={(v) => set('plate_number', v)}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Input label="Owner Name" placeholder="Full name" value={form.owner_name} onChangeText={(v) => set('owner_name', v)} />
      <Input
        label="Owner Email"
        placeholder="owner@email.com"
        value={form.owner_email}
        onChangeText={(v) => set('owner_email', v)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Input
        label="Owner Phone"
        placeholder="080..."
        value={form.owner_phone}
        onChangeText={(v) => set('owner_phone', v)}
        keyboardType="phone-pad"
      />
      <Input label="Make / Model" placeholder="e.g. Toyota Corolla" value={form.make_model} onChangeText={(v) => set('make_model', v)} />
      <Input label="Color" placeholder="e.g. Silver" value={form.color} onChangeText={(v) => set('color', v)} />
      <Input label="Driver Name" placeholder="If different from owner" value={form.driver_name} onChangeText={(v) => set('driver_name', v)} />
      <Input
        label="Driver Phone"
        placeholder="080..."
        value={form.driver_phone}
        onChangeText={(v) => set('driver_phone', v)}
        keyboardType="phone-pad"
      />
      <Select
        label="Facility"
        value={form.facility_id}
        options={facilityOptions}
        onChange={(v) => set('facility_id', v)}
        placeholder="Select facility..."
      />
      <Select label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => set('status', v)} />
      <Select
        label="Registration Type"
        value={form.registration_type}
        options={REGISTRATION_OPTIONS}
        onChange={(v) => set('registration_type', v)}
      />
      <Input
        label="Notes"
        placeholder="Any additional notes..."
        value={form.notes}
        onChangeText={(v) => set('notes', v)}
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />

      <Button
        title={isEdit ? 'Save Changes' : 'Create Vehicle'}
        icon="save-outline"
        loading={save.isPending}
        onPress={onSave}
      />

      {isEdit ? (
        <>
          <SectionTitle style={{ marginTop: spacing.xl }}>QR Code</SectionTitle>
          <Card>
            {vehicle.qr_code_id ? (
              <KeyValue label="Assigned code" value={vehicle.qr_code_id} />
            ) : (
              <>
                <Input
                  label="QR Code ID"
                  placeholder="Enter a code to assign"
                  value={qrInput}
                  onChangeText={setQrInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Button
                  title="Assign QR"
                  icon="qr-code-outline"
                  variant="secondary"
                  disabled={!qrInput.trim()}
                  loading={assignQR.isPending}
                  onPress={() => assignQR.mutate(qrInput.trim())}
                />
              </>
            )}
          </Card>

          <SectionTitle style={{ marginTop: spacing.lg }}>Owner Access</SectionTitle>
          <Button
            title="Invite Owner by Email"
            icon="mail-outline"
            variant="secondary"
            disabled={!form.owner_email}
            loading={invite.isPending}
            onPress={() => invite.mutate()}
          />

          <View style={{ marginTop: spacing.xl }}>
            <Button
              title="Delete Vehicle"
              icon="trash-outline"
              variant="danger"
              loading={remove.isPending}
              onPress={confirmDelete}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
