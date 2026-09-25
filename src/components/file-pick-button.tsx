// src/components/file-pick-button.tsx
// Button that opens the browser's file picker — the same hidden
// <input type="file"> trick product-form-modal.tsx uses for product photos.
// Web-only: on native it renders a note instead, since this project ships no
// native file-picker module.
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FilePickButton({
  label,
  accept,
  file,
  onPick,
  disabled,
}: {
  label: string;
  accept: string;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (Platform.OS !== 'web') {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        การแนบไฟล์รองรับบนเว็บเบราว์เซอร์เท่านั้น
      </ThemedText>
    );
  }

  return (
    <>
      <Pressable
        style={[styles.button, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        onPress={() => inputRef.current?.click()}
        disabled={disabled}>
        <ThemedText type="smallBold">{file ? `📎 ${file.name}` : label}</ThemedText>
        {file ? (
          <ThemedText type="small" themeColor="textSecondary">
            แตะเพื่อเปลี่ยนไฟล์
          </ThemedText>
        ) : null}
      </Pressable>
      {/* Web-only intrinsic DOM element — only reached on web (guarded above). */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // Allow picking the same file again after a failed submit.
          e.target.value = '';
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    gap: 2,
  },
});
