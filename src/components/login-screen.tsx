// src/components/login-screen.tsx
// Real login: POSTs to /api/auth/login, which checks the Users table in MySQL
// and verifies the bcrypt hash server-side. No hard-coded credentials here.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/api';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Please enter both username and password');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      // Never surface DB errors/stack traces — only the safe message the API sent.
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <ThemedText type="title" style={styles.appIcon}>
            📦
          </ThemedText>
          <ThemedText type="subtitle" style={styles.appName}>
            Inventory
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in to manage your products
          </ThemedText>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <ThemedText type="smallBold">Username</ThemedText>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Username"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Password</ThemedText>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, styles.passwordInput, { color: theme.text, borderColor: theme.border }]}
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.toggleButton}>
                <ThemedText type="small" themeColor="primary">
                  {showPassword ? 'Hide' : 'Show'}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {error && (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            </ThemedView>
          )}

          <Pressable
            style={[
              styles.loginButton,
              { backgroundColor: theme.primary },
              isSubmitting && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <ThemedText type="smallBold" themeColor="primaryText">
                Log In
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 420),
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  appIcon: {
    fontSize: 56,
    lineHeight: 60,
  },
  appName: {
    marginTop: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  toggleButton: {
    position: 'absolute',
    right: Spacing.three,
  },
  errorBanner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  loginButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
});
