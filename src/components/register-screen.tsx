// src/components/register-screen.tsx
// Real self-service sign-up: POSTs to /api/auth/register, which inserts into
// the same Users table Login reads, always with role='user' (the server
// decides that, not this screen). On success we don't auto-log-in — per the
// brief the user sees a success message and signs in themselves right after.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { ApiError, authApi } from '@/lib/api';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function RegisterScreen({
  onRegistered,
  onBackToLogin,
}: {
  onRegistered: (username: string) => void;
  onBackToLogin: () => void;
}) {
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername || !password || !confirmPassword) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.register(cleanUsername, password, confirmPassword);
      onRegistered(cleanUsername);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <Image
              source={require('@/assets/images/shop-logo.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
            <ThemedText type="subtitle" style={styles.appName}>
              Mee Dood Cha
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            สร้างบัญชีเพื่อเริ่มช้อปปิ้งกับ Mee Dood Cha
          </ThemedText>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <ThemedText type="smallBold">ชื่อผู้ใช้</ThemedText>
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
            <ThemedText type="smallBold">รหัสผ่าน</ThemedText>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, styles.passwordInput, { color: theme.text, borderColor: theme.border }]}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.toggleButton}>
                <ThemedText type="small" themeColor="primary">
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">ยืนยันรหัสผ่าน</ThemedText>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              onSubmitEditing={handleRegister}
            />
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
              styles.registerButton,
              { backgroundColor: theme.primary },
              isSubmitting && styles.registerButtonDisabled,
            ]}
            onPress={handleRegister}
            disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <ThemedText type="smallBold" themeColor="primaryText">
                สมัครสมาชิก
              </ThemedText>
            )}
          </Pressable>

          <Pressable onPress={onBackToLogin} style={styles.backLink} disabled={isSubmitting}>
            <ThemedText type="small" themeColor="primary">
              มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
            </ThemedText>
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
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  appName: {
    marginTop: 0,
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
  registerButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
