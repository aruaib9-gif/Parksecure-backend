import React, { useState, useEffect } from 'react';
import { View, Text, Alert, Switch } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth, entities } from '../api/client';
import { Screen, Card, Button, Input, KeyValue, SectionTitle } from '../components/ui';
import { colors, spacing, roleLabels } from '../lib/theme';
import { useAuth } from '../context/AuthContext';

const DEFAULT_NOTIF = {
  notify_email: true,
  notify_inapp: true,
  notify_whatsapp: false,
  whatsapp_number: '',
  security_override_enabled: false,
};

function SwitchRow({ label, value, onValueChange, note }) {
  return (
    <View style={{ paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: colors.text, flex: 1, marginRight: spacing.md }}>{label}</Text>
        <Switch
          value={!!value}
          onValueChange={onValueChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#fff"
        />
      </View>
      {note ? <Text style={{ fontSize: 12, color: colors.warning, marginTop: 2 }}>{note}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  // Profile
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Notifications (vehicle owners only)
  const isOwner = user?.role === 'vehicle_owner';
  const [notif, setNotif] = useState(DEFAULT_NOTIF);

  const notifQuery = useQuery({
    queryKey: ['notificationSettings', user?.email],
    queryFn: () => entities.NotificationSettings.filter({ user_email: user.email }),
    enabled: isOwner && !!user?.email,
  });
  const notifRecord = notifQuery.data?.[0] || null;

  useEffect(() => {
    if (notifRecord) {
      setNotif({
        notify_email: notifRecord.notify_email !== false,
        notify_inapp: notifRecord.notify_inapp !== false,
        notify_whatsapp: !!notifRecord.notify_whatsapp,
        whatsapp_number: notifRecord.whatsapp_number || '',
        security_override_enabled: !!notifRecord.security_override_enabled,
      });
    }
  }, [notifRecord?.id]);

  const saveProfile = useMutation({
    mutationFn: () => auth.updateMe({ full_name: fullName.trim(), phone: phone.trim() }),
    onSuccess: async () => {
      await refreshUser();
      Alert.alert('Profile saved', 'Your profile has been updated.');
    },
    onError: (err) => Alert.alert('Save failed', err.message),
  });

  const changePassword = useMutation({
    mutationFn: () => auth.changePassword(currentPw, newPw),
    onSuccess: () => {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      Alert.alert('Password changed', 'Your password has been updated.');
    },
    onError: (err) => Alert.alert('Change failed', err.message),
  });

  const submitPassword = () => {
    if (!currentPw) return Alert.alert('Missing field', 'Enter your current password.');
    if (newPw.length < 8) return Alert.alert('Weak password', 'New password must be at least 8 characters.');
    if (newPw !== confirmPw) return Alert.alert('Mismatch', 'New password and confirmation do not match.');
    changePassword.mutate();
  };

  const saveNotif = useMutation({
    mutationFn: () => {
      const payload = {
        notify_email: notif.notify_email,
        notify_inapp: notif.notify_inapp,
        notify_whatsapp: notif.notify_whatsapp,
        whatsapp_number: notif.notify_whatsapp ? notif.whatsapp_number.trim() : notif.whatsapp_number,
        security_override_enabled: notif.security_override_enabled,
      };
      return notifRecord
        ? entities.NotificationSettings.update(notifRecord.id, payload)
        : entities.NotificationSettings.create({ user_email: user.email, ...payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
      Alert.alert('Saved', 'Notification preferences updated.');
    },
    onError: (err) => Alert.alert('Save failed', err.message),
  });

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to log in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);

  return (
    <Screen>
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <KeyValue label="Email" value={user?.email} />
        <KeyValue label="Role" value={roleLabels[user?.role] || user?.role} />
        <View style={{ height: spacing.md }} />
        <Input label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0800 000 0000" />
        <Button title="Save Profile" icon="save" loading={saveProfile.isPending} onPress={() => saveProfile.mutate()} />
      </Card>

      <SectionTitle>Change Password</SectionTitle>
      <Card>
        <Input label="Current password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry autoCapitalize="none" />
        <Input label="New password" value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" placeholder="Min. 8 characters" />
        <Input
          label="Confirm new password"
          value={confirmPw}
          onChangeText={setConfirmPw}
          secureTextEntry
          autoCapitalize="none"
          error={confirmPw && newPw !== confirmPw ? 'Passwords do not match' : undefined}
        />
        <Button title="Change Password" icon="key" loading={changePassword.isPending} onPress={submitPassword} />
      </Card>

      {isOwner ? (
        <>
          <SectionTitle>Notifications</SectionTitle>
          <Card>
            <SwitchRow
              label="Email notifications"
              value={notif.notify_email}
              onValueChange={(v) => setNotif((s) => ({ ...s, notify_email: v }))}
            />
            <SwitchRow
              label="In-app notifications"
              value={notif.notify_inapp}
              onValueChange={(v) => setNotif((s) => ({ ...s, notify_inapp: v }))}
            />
            <SwitchRow
              label="WhatsApp notifications"
              value={notif.notify_whatsapp}
              onValueChange={(v) => setNotif((s) => ({ ...s, notify_whatsapp: v }))}
            />
            {notif.notify_whatsapp ? (
              <Input
                label="WhatsApp number"
                value={notif.whatsapp_number}
                onChangeText={(v) => setNotif((s) => ({ ...s, whatsapp_number: v }))}
                keyboardType="phone-pad"
                placeholder="+234..."
              />
            ) : null}
            <SwitchRow
              label="Auto-approve exits (security override)"
              value={notif.security_override_enabled}
              onValueChange={(v) => setNotif((s) => ({ ...s, security_override_enabled: v }))}
              note="Caution: your vehicle can exit without your approval when this is on."
            />
            <Button
              title="Save Preferences"
              icon="notifications"
              style={{ marginTop: spacing.sm }}
              loading={saveNotif.isPending}
              onPress={() => saveNotif.mutate()}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>About</SectionTitle>
      <Card>
        <KeyValue label="App" value="ParkSecure" />
        <KeyValue label="Version" value="1.0.0" />
        <Text style={{ fontSize: 12, color: colors.textLight, marginTop: spacing.sm }}>
          Vehicle and parking security for facilities across Nigeria. By using this app you agree to the
          ParkSecure API terms of service and privacy policy, available from your facility administrator.
        </Text>
      </Card>

      <Button title="Sign Out" icon="log-out" variant="danger" onPress={confirmSignOut} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}
