import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Screen, Card } from '../components/ui';
import { colors, spacing, roleLabels } from '../lib/theme';

export default function MoreScreen({ navigation }) {
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();

  const items = [
    { title: 'Vehicles', icon: 'car-outline', screen: 'Vehicles' },
    { title: 'Scan Logs', icon: 'list-outline', screen: 'ScanLogs' },
    { title: 'QR Codes', icon: 'qr-code-outline', screen: 'QRCodes' },
    { title: 'Security Alerts', icon: 'warning-outline', screen: 'SecurityAlerts' },
    { title: 'Items Log', icon: 'cube-outline', screen: 'ItemsLog' },
    { title: 'Shift Handover', icon: 'swap-horizontal-outline', screen: 'ShiftHandover' },
    ...(isAdmin ? [
      { title: 'Payments & Billing', icon: 'card-outline', screen: 'Payments' },
      { title: 'Users', icon: 'people-outline', screen: 'Users' },
    ] : []),
    ...(isSuperAdmin ? [
      { title: 'Facilities', icon: 'business-outline', screen: 'Facilities' },
    ] : []),
    { title: 'Offline Sync', icon: 'cloud-offline-outline', screen: 'SyncStatus' },
    { title: 'Settings', icon: 'settings-outline', screen: 'Settings' },
  ];

  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>
            {(user.full_name || user.email)[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{user.full_name || user.email}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{roleLabels[user.role] || user.role}</Text>
        </View>
      </Card>

      {items.map((item) => (
        <TouchableOpacity
          key={item.title}
          onPress={() => navigation.navigate(item.screen)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12,
            marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Ionicons name={item.icon} size={20} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{item.title}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={() =>
          Alert.alert('Sign out?', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: logout },
          ])
        }
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.md }}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Sign Out</Text>
      </TouchableOpacity>
    </Screen>
  );
}
