import React, { useState, useRef, useCallback } from 'react';
import { View, Text, Alert, Linking, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { scans, exits } from '../api/client';
import { enqueueScan } from '../lib/offlineQueue';
import { Screen, Card, Button, Badge, Input, KeyValue, SectionTitle, Row } from '../components/ui';
import { colors, spacing, formatNaira, formatDate } from '../lib/theme';

// Scanner flow states: scan -> lookup -> (entry | exit confirm) -> result
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState('scan'); // scan | lookup | entry | exit | result
  const [lookup, setLookup] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [items, setItems] = useState([]);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemStates, setItemStates] = useState([]); // exit confirmation
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const scanLock = useRef(false);
  const queryClient = useQueryClient();

  const reset = useCallback(() => {
    setPhase('scan');
    setLookup(null);
    setManualCode('');
    setDriverName('');
    setDriverPhone('');
    setItems([]);
    setItemStates([]);
    setResult(null);
    scanLock.current = false;
  }, []);

  const invalidate = () => {
    ['dashboard', 'recentScans', 'exitRequests', 'vehicles', 'scanLogs'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  };

  const handleCode = async (code) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setBusy(true);
    try {
      const data = await scans.lookup(code.trim());
      setLookup({ ...data, code: code.trim() });
      if (data.result === 'blacklisted') {
        setPhase('lookup');
      } else if (data.result === 'unknown_code' || data.result === 'unregistered') {
        setPhase('lookup');
      } else if (data.vehicle?.is_inside) {
        // Prepare exit confirmation from the entry declaration.
        const declared = await lastDeclaredItems(data.vehicle.id);
        setItemStates(declared.map((it) => ({ name: it.name, quantity: it.quantity, confirmed: true, discrepancy: '' })));
        setPhase('exit');
      } else {
        setDriverName(data.vehicle?.driver_name || '');
        setDriverPhone(data.vehicle?.driver_phone || '');
        setPhase('entry');
      }
    } catch (err) {
      if (err.status === 0) {
        Alert.alert('Offline', 'No connection. You can still record scans — they will sync when back online.', [
          { text: 'Record Entry', onPress: () => offlineRecord('ENTRY', code) },
          { text: 'Record Exit', onPress: () => offlineRecord('EXIT', code) },
          { text: 'Cancel', style: 'cancel', onPress: reset },
        ]);
      } else {
        Alert.alert('Scan failed', err.message, [{ text: 'OK', onPress: reset }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const lastDeclaredItems = async (vehicleId) => {
    try {
      const { entities } = require('../api/client');
      const logs = await entities.ScanLog.filter({ vehicle_id: vehicleId, scan_type: 'entry' }, { limit: 1, sort: '-created_date' });
      return Array.isArray(logs?.[0]?.items_declared) ? logs[0].items_declared : [];
    } catch {
      return [];
    }
  };

  const offlineRecord = async (type, code) => {
    await enqueueScan(type, { qr_code_id: code });
    setResult({ kind: 'queued', title: `${type === 'ENTRY' ? 'Entry' : 'Exit'} queued`, message: 'Saved offline — will sync automatically when connection returns.' });
    setPhase('result');
  };

  const submitEntry = async () => {
    setBusy(true);
    try {
      const payload = {
        qr_code_id: lookup.code,
        driver_name: driverName || undefined,
        driver_phone: driverPhone || undefined,
        items: items.map((it) => ({ name: it.name, quantity: Number(it.quantity) || 1 })),
      };
      const data = await scans.entry(payload);
      invalidate();
      setResult({ kind: 'entry_ok', title: 'Entry Recorded ✓', message: `${data.vehicle.plate_number} is now inside`, data });
      setPhase('result');
    } catch (err) {
      if (err.status === 0) {
        await enqueueScan('ENTRY', { qr_code_id: lookup.code, driver_name: driverName, items });
        setResult({ kind: 'queued', title: 'Entry queued', message: 'Offline — will sync automatically.' });
        setPhase('result');
      } else {
        Alert.alert('Entry failed', err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitExit = async () => {
    setBusy(true);
    try {
      const payload = { qr_code_id: lookup.code, items_state: itemStates };
      const data = await scans.exit(payload);
      invalidate();
      if (data.auto_approved) {
        setResult({ kind: 'exit_ok', title: 'Exit Approved ✓', message: `${lookup.vehicle.plate_number} cleared by security override`, data });
      } else {
        setResult({ kind: 'exit_pending', title: 'Awaiting Owner Approval', message: 'The owner has been notified by push/email.', data });
        pollExit(data.exit_request.id);
      }
      setPhase('result');
    } catch (err) {
      if (err.status === 0) {
        await enqueueScan('EXIT', { qr_code_id: lookup.code, items_state: itemStates });
        setResult({ kind: 'queued', title: 'Exit queued', message: 'Offline — will sync automatically.' });
        setPhase('result');
      } else {
        Alert.alert('Exit failed', err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  // Poll the exit request while the "awaiting approval" card is shown.
  const pollExit = (id) => {
    const { entities } = require('../api/client');
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > 100) return clearInterval(timer);
      try {
        const reqs = await entities.ExitRequest.filter({ id });
        const req = Array.isArray(reqs) ? reqs[0] : null;
        if (req && req.status !== 'pending') {
          clearInterval(timer);
          invalidate();
          setResult((r) =>
            r?.kind === 'exit_pending'
              ? {
                  kind: req.status === 'approved' ? 'exit_ok' : 'exit_rejected',
                  title: req.status === 'approved' ? 'Exit Approved ✓' : `Exit ${req.status}`,
                  message: req.status === 'approved' ? 'Owner approved — vehicle may leave.' : 'Owner rejected the exit. Do not release the vehicle.',
                  data: r.data,
                }
              : r
          );
        }
      } catch {}
    }, 3000);
  };

  const staffOverride = async () => {
    const id = result?.data?.exit_request?.id;
    if (!id) return;
    setBusy(true);
    try {
      await exits.approve(id);
      invalidate();
      setResult((r) => ({ ...r, kind: 'exit_ok', title: 'Exit Approved ✓', message: 'Approved by staff.' }));
    } catch (err) {
      Alert.alert('Approve failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- render ----------
  if (phase === 'scan') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => handleCode(data)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text style={{ color: '#fff', textAlign: 'center', marginVertical: spacing.lg }}>
              Camera access is needed to scan vehicle QR codes
            </Text>
            <Button title="Grant Camera Access" onPress={requestPermission} />
          </View>
        )}
        <View style={{ position: 'absolute', top: '30%', alignSelf: 'center', width: 230, height: 230, borderWidth: 3, borderColor: colors.primaryLight, borderRadius: 20 }} pointerEvents="none" />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg }}>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm }}>Or enter the code manually</Text>
          <Row>
            <Input placeholder="PSK-0001" value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" style={{ flex: 1 }} />
            <Button title="Go" onPress={() => manualCode && handleCode(manualCode)} loading={busy} />
          </Row>
        </View>
      </View>
    );
  }

  if (phase === 'lookup') {
    const v = lookup?.vehicle;
    const kind = lookup?.result;
    return (
      <Screen>
        <Card style={{ borderColor: kind === 'blacklisted' ? colors.danger : colors.warning, borderWidth: 2 }}>
          <Badge label={kind === 'blacklisted' ? 'blacklisted' : 'unregistered'} status={kind === 'blacklisted' ? 'blacklisted' : 'pending'} />
          <Text style={{ fontSize: 20, fontWeight: '800', marginVertical: spacing.sm, color: colors.text }}>
            {kind === 'blacklisted' ? `${v.plate_number} is blacklisted` : `Code ${lookup.code}`}
          </Text>
          <Text style={{ color: colors.textMuted }}>
            {kind === 'blacklisted'
              ? 'Access denied. A security alert has been raised.'
              : kind === 'unknown_code'
                ? 'This code does not exist in the system.'
                : 'This QR code has not been assigned to a vehicle yet. Register the vehicle from the Vehicles screen, then assign this code.'}
          </Text>
        </Card>
        <Button title="Scan Again" onPress={reset} icon="qr-code-outline" />
      </Screen>
    );
  }

  if (phase === 'entry') {
    const v = lookup.vehicle;
    return (
      <Screen>
        <Card>
          <Badge label="entry" />
          <Text style={{ fontSize: 22, fontWeight: '800', marginVertical: spacing.xs, color: colors.text }}>{v.plate_number}</Text>
          <KeyValue label="Owner" value={v.owner_name} />
          <KeyValue label="Vehicle" value={v.make_model} />
          {v.registration_type === 'guest' ? <KeyValue label="Guest pass until" value={formatDate(v.guest_pass_expires)} /> : null}
        </Card>

        <SectionTitle>Driver Today</SectionTitle>
        <Input label="Driver name" value={driverName} onChangeText={setDriverName} placeholder="Same as owner" />
        <Input label="Driver phone" value={driverPhone} onChangeText={setDriverPhone} keyboardType="phone-pad" placeholder="Optional" />

        <SectionTitle>Items Declared (optional)</SectionTitle>
        {items.map((it, idx) => (
          <Card key={idx} style={{ paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>{it.name} × {it.quantity}</Text>
            <TouchableOpacity onPress={() => setItems(items.filter((_, i) => i !== idx))}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </Card>
        ))}
        <Row>
          <Input placeholder="Item name" value={itemName} onChangeText={setItemName} style={{ flex: 1 }} />
          <Input placeholder="Qty" value={itemQty} onChangeText={setItemQty} keyboardType="numeric" style={{ width: 60 }} />
          <Button
            title="Add"
            small
            variant="secondary"
            onPress={() => {
              if (!itemName.trim()) return;
              setItems([...items, { name: itemName.trim(), quantity: itemQty || '1' }]);
              setItemName('');
              setItemQty('1');
            }}
          />
        </Row>

        <Button title="Record Entry" icon="enter-outline" onPress={submitEntry} loading={busy} style={{ marginTop: spacing.lg }} />
        <Button title="Cancel" variant="ghost" onPress={reset} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  if (phase === 'exit') {
    const v = lookup.vehicle;
    return (
      <Screen>
        <Card>
          <Badge label="exit" />
          <Text style={{ fontSize: 22, fontWeight: '800', marginVertical: spacing.xs, color: colors.text }}>{v.plate_number}</Text>
          <KeyValue label="Owner" value={v.owner_name} />
          <KeyValue label="Entered" value={formatDate(v.last_entry)} />
        </Card>

        {itemStates.length > 0 ? (
          <>
            <SectionTitle>Confirm Declared Items</SectionTitle>
            {itemStates.map((it, idx) => (
              <Card key={idx} style={{ paddingVertical: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{it.name} × {it.quantity || 1}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      setItemStates(itemStates.map((s, i) => (i === idx ? { ...s, confirmed: !s.confirmed } : s)))
                    }
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Ionicons
                      name={it.confirmed ? 'checkmark-circle' : 'alert-circle'}
                      size={22}
                      color={it.confirmed ? colors.success : colors.danger}
                    />
                    <Text style={{ fontSize: 12, color: it.confirmed ? colors.success : colors.danger }}>
                      {it.confirmed ? 'Present' : 'Missing'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {!it.confirmed ? (
                  <Input
                    placeholder="Describe the discrepancy"
                    value={it.discrepancy}
                    onChangeText={(text) => setItemStates(itemStates.map((s, i) => (i === idx ? { ...s, discrepancy: text } : s)))}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        <Button title="Confirm & Request Exit" icon="exit-outline" onPress={submitExit} loading={busy} style={{ marginTop: spacing.lg }} />
        <Button title="Cancel" variant="ghost" onPress={reset} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  // result
  const kindStyles = {
    entry_ok: [colors.success, 'checkmark-circle'],
    exit_ok: [colors.success, 'checkmark-circle'],
    exit_pending: [colors.warning, 'hourglass'],
    exit_rejected: [colors.danger, 'close-circle'],
    queued: [colors.info, 'cloud-offline'],
  };
  const [color, icon] = kindStyles[result?.kind] || [colors.textMuted, 'help-circle'];
  const billing = result?.data?.billing;
  return (
    <Screen>
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, borderColor: color, borderWidth: 2 }}>
        <Ionicons name={icon} size={64} color={color} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.md }}>{result?.title}</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm }}>{result?.message}</Text>
        {billing && billing.amount > 0 ? (
          <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Parking fee ({billing.mode})</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primary }}>{formatNaira(billing.amount)}</Text>
          </View>
        ) : null}
      </Card>
      {result?.kind === 'exit_pending' ? (
        <>
          {result?.data?.whatsapp_url ? (
            <Button title="Notify via WhatsApp" icon="logo-whatsapp" variant="success" onPress={() => Linking.openURL(result.data.whatsapp_url)} style={{ marginBottom: spacing.sm }} />
          ) : null}
          <Button title="Staff Override — Approve Now" variant="danger" onPress={staffOverride} loading={busy} style={{ marginBottom: spacing.sm }} />
        </>
      ) : null}
      <Button title="Scan Next Vehicle" icon="qr-code-outline" onPress={reset} />
    </Screen>
  );
}
