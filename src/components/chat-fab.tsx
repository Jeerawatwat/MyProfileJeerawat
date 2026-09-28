// src/components/chat-fab.tsx
// "แชทกับเรา" (Chat with us) — opens the shop's real Facebook Page in
// Messenger. Used to be a floating button shown on every screen; now it's a
// plain inline button placed on the Profile screen instead (src/app/profile.tsx),
// so it never covers other content. Pure UI convenience; it does not touch
// the API/DB at all.
import { Linking, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Numeric Facebook Page ID (from facebook.com/profile.php?id=...) — m.me
// accepts page IDs the same way it accepts page usernames.
const MESSENGER_URL = 'https://m.me/61593833274270';

export function ChatButton() {
  const theme = useTheme();

  const handlePress = () => {
    Linking.openURL(MESSENGER_URL).catch(() => {
      // If the Messenger deep link fails for any reason, fall back to the
      // plain Facebook Page — still gets the customer to a way to chat.
      Linking.openURL('https://www.facebook.com/profile.php?id=61593833274270');
    });
  };

  return (
    <Pressable
      style={[styles.button, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      onPress={handlePress}
      accessibilityLabel="แชทกับเราทาง Messenger">
      <ThemedText style={styles.icon}>💬</ThemedText>
      <ThemedText type="smallBold">แชทกับเรา</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  icon: {
    fontSize: 18,
  },
});
