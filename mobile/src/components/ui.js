// Shared UI building blocks used across every screen.
import React from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, ScrollView, RefreshControl, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, statusColors, spacing } from '../lib/theme';

export function Screen({ children, scroll = true, refreshing, onRefresh, style }) {
  if (!scroll) return <View style={[styles.screen, style]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: 40 }, style]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }) {
  const inner = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) return <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{inner}</TouchableOpacity>;
  return inner;
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style, small }) {
  const bg = { primary: colors.primary, danger: colors.danger, success: colors.success, secondary: colors.card, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.primary : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} style={{ marginRight: 6 }} /> : null}
          <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Badge({ label, status, style }) {
  const [fg, bg] = statusColors[status || label] || [colors.textMuted, colors.border];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>
        {String(label || '').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

export function Input({ label, error, style, ...props }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textLight}
        style={[styles.input, error && { borderColor: colors.danger }, style]}
        {...props}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 2 }}>{error}</Text> : null}
    </View>
  );
}

// Simple picker rendered as a modal list (avoids an extra native dependency).
export function Select({ label, value, options, onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TouchableOpacity style={styles.input} onPress={() => setOpen(true)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: selected ? colors.text : colors.textLight, fontSize: 15 }}>
            {selected ? selected.label : placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={styles.modalOption}
                  onPress={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Text style={{ fontSize: 15, color: opt.value === value ? colors.primary : colors.text, fontWeight: opt.value === value ? '700' : '400' }}>
                    {opt.label}
                  </Text>
                  {opt.value === value ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function StatCard({ label, value, icon, color = colors.primary, style }) {
  return (
    <Card style={[{ flex: 1, alignItems: 'flex-start' }, style]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 }}>{value ?? '—'}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, subtitle }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing.xxl }}>
      <Ionicons name={icon} size={44} color={colors.textLight} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textMuted, marginTop: 12 }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 13, color: colors.textLight, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Row({ children, style }) {
  return <View style={[{ flexDirection: 'row', gap: spacing.md }, style]}>{children}</View>;
}

export function KeyValue({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value ?? '—'}</Text>
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md, marginTop: spacing.sm }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 14 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 5 },
  statIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '60%',
    paddingVertical: spacing.sm,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
