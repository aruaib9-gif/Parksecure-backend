import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';
import { colors, spacing } from '../lib/theme';
import { getApiUrl, setApiUrl, probeApiUrl, DEFAULT_API_URL } from '../api/client';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [serverVisible, setServerVisible] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiUrl());
  const [serverBusy, setServerBusy] = useState(false);
  const [activeServer, setActiveServer] = useState(getApiUrl());

  const submit = async () => {
    if (!email || !password) return Alert.alert('Missing details', 'Enter your email and password');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openServerSettings = () => {
    setServerUrl(getApiUrl());
    setServerVisible(true);
  };

  const saveServer = async () => {
    setServerBusy(true);
    try {
      await probeApiUrl(serverUrl);
      await setApiUrl(serverUrl);
      setActiveServer(getApiUrl());
      setServerVisible(false);
      Alert.alert('Server updated', `Now connecting to ${getApiUrl()}`);
    } catch (err) {
      Alert.alert('Could not reach that server', `${err.message}\n\nCheck the address and that the API is running.`);
    } finally {
      setServerBusy(false);
    }
  };

  const resetServer = async () => {
    setServerBusy(true);
    try {
      await setApiUrl('');
      setServerUrl(getApiUrl());
      setActiveServer(getApiUrl());
    } finally {
      setServerBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
          <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark" size={48} color="#fff" />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 16 }}>ParkSecure</Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>Vehicle Security Management</Text>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: spacing.xl }}>
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          <Button title="Sign In" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
          <Button title="Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} style={{ marginTop: spacing.sm }} />
        </View>

        <Pressable onPress={openServerSettings} style={{ marginTop: spacing.lg, alignItems: 'center' }} hitSlop={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="server-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 6 }} numberOfLines={1}>
              {activeServer.replace(/^https?:\/\//, '')}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>Tap to change server</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={serverVisible} transparent animationType="fade" onRequestClose={() => setServerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: spacing.xl }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Server address</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md }}>
              The ParkSecure API this app talks to. Your administrator can provide this.
            </Text>
            <Input
              label="API URL"
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://your-api.onrender.com"
            />
            <Button title="Test & Save" onPress={saveServer} loading={serverBusy} />
            <Button title="Reset to default" variant="ghost" onPress={resetServer} disabled={serverBusy} style={{ marginTop: spacing.sm }} />
            <Button title="Cancel" variant="ghost" onPress={() => setServerVisible(false)} disabled={serverBusy} style={{ marginTop: spacing.xs }} />
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' }}>
              Default: {DEFAULT_API_URL.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
