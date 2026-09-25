// src/components/authed-image.tsx
// Shows an image that sits behind the API's auth (payment slips, the shop's
// payment QR, refund evidence). A plain <Image uri> can't send the JWT, so
// the bytes are fetched with it and shown from a blob: URL, which is revoked
// again on unmount.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, fetchAuthedBlobUrl } from '@/lib/api';

export function AuthedImage({
  path,
  style,
  contentFit = 'contain',
}: {
  path: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
}) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setUri(null);
    setError(null);
    fetchAuthedBlobUrl(path)
      .then((url) => {
        created = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setUri(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'โหลดรูปไม่สำเร็จ');
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);

  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : error ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
          {error}
        </ThemedText>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    padding: Spacing.three,
  },
});
