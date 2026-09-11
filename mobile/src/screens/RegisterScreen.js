import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Screen, Button, Input } from '../components/ui';
import { colors, spacing } from '../lib/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.email || !form.password) return Alert.alert('Missing details', 'Email and password are required');
    if (form.password.length < 8) return Alert.alert('Weak password', 'Password must be at least 8 characters');
    if (form.password !== form.confirm) return Alert.alert('Password mismatch', 'Passwords do not match');
    setLoading(true);
    try {
      await register({ email: form.email.trim(), password: form.password, full_name: form.full_name, phone: form.phone });
    } catch (err) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg }}>
        Vehicle owners: use the same email your facility has on file so your vehicles appear automatically.
      </Text>
      <Input label="Full Name" value={form.full_name} onChangeText={set('full_name')} placeholder="John Doe" />
      <Input label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
      <Input label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+234..." />
      <Input label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="Min. 8 characters" />
      <Input label="Confirm Password" value={form.confirm} onChangeText={set('confirm')} secureTextEntry placeholder="Repeat password" />
      <Button title="Create Account" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
