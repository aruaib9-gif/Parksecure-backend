import React, { useState } from 'react';
import { View, Text, Modal, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entities, functions } from '../api/client';
import { Button, Input, Card, EmptyState, Loading } from './ui';
import { colors, spacing } from '../lib/theme';

/**
 * Assign a QR code to a vehicle, three ways:
 *   - pick an unassigned code already generated for the facility
 *   - scan a physical sticker with the camera
 *   - type the code by hand
 *
 * Every route checks the code's status first, so staff are told that a sticker
 * is already on another vehicle *before* the assignment is attempted.
 */
export default function QRAssign({ vehicle, onAssigned }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(null); // 'pick' | 'scan' | null
  const [manual, setManual] = useState('');
  const [checking, setChecking] = useState(false);
  const scanLock = React.useRef(false);

  const [permission, requestPermission] = useCameraPermissions();

  // Codes still free at this facility — what staff can hand out right now.
  const availableQuery = useQuery({
    queryKey: ['qrcodes', 'available', vehicle.facility_id],
    queryFn: () =>
      entities.QRCode.filter({
        ...(vehicle.facility_id ? { facility_id: vehicle.facility_id } : {}),
        status: 'available',
      }),
    enabled: mode === 'pick',
  });

  const assign = useMutation({
    mutationFn: (code) => functions.assignQRCode(vehicle.id, code),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['qrcodes'] });
      close();
      Alert.alert('QR assigned', `${res.qr_code.code_id} is now on ${vehicle.plate_number}.`);
      onAssigned?.(res);
    },
    onError: (err) => Alert.alert('Could not assign', err.message),
  });

  const close = () => {
    setMode(null);
    setManual('');
    scanLock.current = false;
  };

  /** Check before assigning so a taken sticker gives a useful message. */
  const checkThenAssign = async (codeId) => {
    const code = String(codeId || '').trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    try {
      const status = await functions.qrCodeStatus(code);
      if (!status.assignable) {
        Alert.alert(
          status.result === 'unknown_code' ? 'Code not recognised' : 'Code not available',
          status.message,
        );
        scanLock.current = false;
        return;
      }
      if (status.result === 'assigned_orphaned') {
        // Previously held by a vehicle that no longer exists — confirm rather
        // than silently reusing a sticker that may still be in circulation.
        Alert.alert('Reuse this code?', `${code} was assigned before but no vehicle holds it now.`, [
          { text: 'Cancel', style: 'cancel', onPress: () => { scanLock.current = false; } },
          { text: 'Reuse', onPress: () => assign.mutate(code) },
        ]);
        return;
      }
      assign.mutate(code);
    } catch (err) {
      Alert.alert('Check failed', err.message);
      scanLock.current = false;
    } finally {
      setChecking(false);
    }
  };

  const onScanned = ({ data }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    checkThenAssign(data);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        return Alert.alert('Camera needed', 'Allow camera access to scan a QR sticker.');
      }
    }
    scanLock.current = false;
    setMode('scan');
  };

  const busy = checking || assign.isPending;

  return (
    <>
      <Button
        title="Choose from available codes"
        icon="list-outline"
        variant="secondary"
        onPress={() => setMode('pick')}
        style={{ marginBottom: spacing.sm }}
      />
      <Button
        title="Scan a physical code"
        icon="qr-code-outline"
        variant="secondary"
        onPress={openScanner}
        style={{ marginBottom: spacing.sm }}
      />
      <Input
        label="Or enter a code"
        placeholder="e.g. DCCI-0001"
        value={manual}
        onChangeText={setManual}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button
        title="Assign"
        icon="checkmark-circle-outline"
        disabled={!manual.trim() || busy}
        loading={busy}
        onPress={() => checkThenAssign(manual)}
      />

      {/* Pick from the pool of unassigned codes */}
      <Modal visible={mode === 'pick'} animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.text }}>Available codes</Text>
            <Pressable onPress={close} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.textMuted} />
            </Pressable>
          </View>
          {availableQuery.isLoading ? (
            <Loading />
          ) : (availableQuery.data || []).length === 0 ? (
            <EmptyState
              icon="qr-code-outline"
              title="No unassigned codes"
              subtitle="Generate a batch for this facility from the QR Codes screen first."
            />
          ) : (
            <FlatList
              data={availableQuery.data}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
              renderItem={({ item }) => (
                <Card onPress={busy ? undefined : () => checkThenAssign(item.code_id)} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="qr-code" size={22} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{item.code_id}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>
                        {item.batch_name || 'Unbatched'}
                        {item.code_type === 'guest' ? ' · guest' : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
                  </View>
                </Card>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Scan a printed sticker */}
      <Modal visible={mode === 'scan'} animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : onScanned}
          />
          <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Point at the QR sticker
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
              Assigning to {vehicle.plate_number}
            </Text>
          </View>
          {busy ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={{ color: '#fff', marginTop: spacing.md }}>Checking code…</Text>
            </View>
          ) : null}
          <View style={{ position: 'absolute', bottom: 40, left: spacing.xl, right: spacing.xl }}>
            <Button title="Cancel" variant="secondary" onPress={close} />
          </View>
        </View>
      </Modal>
    </>
  );
}
