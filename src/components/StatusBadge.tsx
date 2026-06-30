import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'paid' | string | null | undefined;

function getStyle(status: PaymentStatus, variant?: 'fish' | 'bird') {
  if (variant === 'bird' || variant === 'fish') {
    switch (status) {
      case 'approved':
      case 'paid':
        return { bg: '#DCFCE7', fg: '#166534', label: '審核完成' };
      case 'pending':
      case 'rejected':
      default:
        return { bg: '#FEF3C7', fg: '#92400E', label: '審核中' };
    }
  }
  // legacy: no variant specified
  switch (status) {
    case 'approved':
      return { bg: '#DCFCE7', fg: '#166534', label: '審核完成' };
    case 'paid':
      return { bg: '#DBEAFE', fg: '#1D4ED8', label: '已撥款' };
    case 'rejected':
      return { bg: '#FEF3C7', fg: '#92400E', label: '審核中' };
    case 'pending':
    default:
      return { bg: '#F3F4F6', fg: '#374151', label: '審核中' };
  }
}

export function StatusBadge({ status, variant }: { status: PaymentStatus; variant?: 'fish' | 'bird' }) {
  const s = getStyle(status, variant);
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}> 
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '900',
  },
});
