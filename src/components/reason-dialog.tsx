// src/components/reason-dialog.tsx
// "Why?" modal for actions that must record a reason — rejecting a payment or
// a refund. Same look as the cancel-order reason modal in orders-admin.tsx.
// The backend also refuses an empty reason; the check here is just fast
// feedback.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ReasonDialog({
  visible,
  title,
  hint,
  placeholder,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  placeholder?: string;
  confirmLabel: string;
  onCancel: () => void;
  // Resolve to close; throw/return an error message to keep it open.
  onConfirm: (reason: string) => Promise<string | void>;
}) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('กรุณาระบุเหตุผล');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await onConfirm(trimmed);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {hint ? (
            <ThemedText type="small" themeColor="textSecondary">
              {hint}
            </ThemedText>
          ) : null}
          <TextInput
            value={reason}
            onChangeText={(text) => {
              setReason(text);
              if (error) setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={3}
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            editable={!busy}
          />
          {error ? (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={[styles.button, { backgroundColor: theme.backgroundElement }]} disabled={busy} onPress={onCancel}>
              <ThemedText type="smallBold">ย้อนกลับ</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: theme.danger }, busy && styles.disabled]}
              disabled={busy}
              onPress={submit}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                  {confirmLabel}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Spacing.four,
    padding: Spacing.five,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});
