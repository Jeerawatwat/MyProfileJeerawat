// src/components/transfer-slip-dialog.tsx
// "Confirm the refund was transferred" modal — same shape as ReasonDialog,
// but requires attaching a transfer slip instead of typing a reason, since
// accounting must prove the money actually left the company's account.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { FilePickButton } from './file-pick-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TransferSlipDialog({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  // Resolve to close; throw/return an error message to keep it open.
  onConfirm: (transferSlip: File) => Promise<string | void>;
}) {
  const theme = useTheme();
  const [slip, setSlip] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSlip(null);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!slip) {
      setError('กรุณาแนบสลิป/หลักฐานการโอนเงินคืน');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err = await onConfirm(slip);
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {message ? (
            <ThemedText type="small" themeColor="textSecondary">
              {message}
            </ThemedText>
          ) : null}
          <FilePickButton
            label="แนบสลิป/หลักฐานการโอนเงิน"
            accept="image/png,image/jpeg,image/webp"
            file={slip}
            onPick={(file) => {
              setSlip(file);
              if (error) setError(null);
            }}
            disabled={busy}
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
              style={[styles.button, { backgroundColor: theme.primary }, busy && styles.disabled]}
              disabled={busy}
              onPress={submit}>
              {busy ? <ActivityIndicator color={theme.primaryText} /> : <ThemedText type="smallBold" themeColor="primaryText">ยืนยัน</ThemedText>}
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
