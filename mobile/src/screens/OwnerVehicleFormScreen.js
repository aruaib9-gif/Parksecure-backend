import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities } from '../api/client';
import { Screen, Card, Button, Input, Select, SectionTitle } from '../components/ui';
import { colors, spacing } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

export default function OwnerVehicleFormScreen({ navigation }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [plateNumber, setPlateNumber] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [color, setColor] = useState('');
  const [ownerPhone, setOwnerPhone] = useState(user?.phone || '');
  const [facilityId, setFacilityId] = useState(null);

  const facilitiesQuery = useQuery({
    queryKey: ['facilities'],
    queryFn: () => entities.Facility.list(),
  });

  const facilityOptions = (facilitiesQuery.data || []).map((f) => ({
    value: f.id,
    label: f.city ? `${f.name} — ${f.city}` : f.name,
  }));

  const create = useMutation({
    mutationFn: () =>
      entities.Vehicle.create({
        plate_number: plateNumber.trim().toUpperCase(),
        make_model: makeModel.trim(),
        color: color.trim(),
        owner_phone: ownerPhone.trim(),
        facility_id: facilityId,
        owner_name: user.full_name || user.email,
        owner_email: user.email,
        qr_requested: true,
        qr_request_date: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerVehicles'] });
      Alert.alert(
        'Vehicle registered',
        'Facility staff will assign your QR code.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (err) => Alert.alert('Registration failed', err.message),
  });

  const submit = () => {
    if (!plateNumber.trim()) {
      Alert.alert('Missing plate number', 'Please enter your vehicle plate number.');
      return;
    }
    if (!facilityId) {
      Alert.alert('Select a facility', 'Please choose the facility where you park.');
      return;
    }
    create.mutate();
  };

  return (
    <Screen>
      <SectionTitle>Register a Vehicle</SectionTitle>
      <Input
        label="Plate Number *"
        value={plateNumber}
        onChangeText={setPlateNumber}
        placeholder="e.g. ABC-123-XY"
        autoCapitalize="characters"
      />
      <Input
        label="Make & Model"
        value={makeModel}
        onChangeText={setMakeModel}
        placeholder="e.g. Toyota Corolla"
      />
      <Input
        label="Color"
        value={color}
        onChangeText={setColor}
        placeholder="e.g. Silver"
      />
      <Input
        label="Phone Number"
        value={ownerPhone}
        onChangeText={setOwnerPhone}
        placeholder="e.g. 0803 000 0000"
        keyboardType="phone-pad"
      />
      <Select
        label="Facility"
        value={facilityId}
        options={facilityOptions}
        onChange={setFacilityId}
        placeholder={facilitiesQuery.isLoading ? 'Loading facilities...' : 'Select facility...'}
      />

      <Button
        title="Register Vehicle"
        icon="car-outline"
        onPress={submit}
        loading={create.isPending}
        style={{ marginTop: spacing.sm }}
      />

      <Card style={{ marginTop: spacing.lg, backgroundColor: colors.infoBg, borderColor: colors.info }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name="qr-code-outline" size={18} color={colors.info} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.info, lineHeight: 19 }}>
            After registering, visit the facility gate office. Staff there will verify your vehicle and assign the QR
            code sticker used for entry and exit scanning.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
