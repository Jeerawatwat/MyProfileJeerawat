// src/components/product-form-modal.tsx
// Add / Edit Product. Fields match the real Inventory table — name, category,
// price, stock, image_url. image_url can come from either pasting an external
// URL or uploading a file (web) through POST /api/uploads/image.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { ApiError, resolveImageUrl, uploadsApi, type Product, type ProductInput } from '@/lib/api';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProductFormModalProps = {
  visible: boolean;
  mode: 'add' | 'edit';
  initialProduct?: Product | null;
  categories: string[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (data: ProductInput) => Promise<void> | void;
};

function validate(name: string, category: string, price: string, stock: string) {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Product name is required');
  if (!category.trim()) errors.push('Category is required');

  const priceNumber = Number(price);
  if (price.trim() === '' || Number.isNaN(priceNumber) || priceNumber < 0) {
    errors.push('Price must be a non-negative number');
  }

  const stockNumber = Number(stock);
  if (stock.trim() === '' || !Number.isInteger(stockNumber) || stockNumber < 0) {
    errors.push('Stock must be a non-negative whole number');
  }

  return { errors, priceNumber, stockNumber };
}

export function ProductFormModal({
  visible,
  mode,
  initialProduct,
  categories,
  busy = false,
  onClose,
  onSubmit,
}: ProductFormModalProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initialProduct?.name ?? '');
    setCategory(initialProduct?.category ?? '');
    setPrice(initialProduct ? String(initialProduct.price) : '');
    setStock(initialProduct ? String(initialProduct.stock) : '');
    setImageUrl(initialProduct?.image_url ?? '');
    setDescription(initialProduct?.description ?? '');
    setErrors([]);
    setUploadError(null);
  }, [visible, initialProduct]);

  const handleSubmit = async () => {
    const result = validate(name, category, price, stock);
    if (result.errors.length) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    await onSubmit({
      name: name.trim(),
      category: category.trim(),
      price: result.priceNumber,
      stock: result.stockNumber,
      image_url: imageUrl.trim() || null,
      description: description.trim() || null,
    });
  };

  const handleFilePicked = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const { url } = await uploadsApi.uploadImage(file, file.name);
      setImageUrl(url);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const previewUrl = resolveImageUrl(imageUrl);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle" style={styles.title}>
              {mode === 'add' ? 'New product' : 'Edit product'}
            </ThemedText>

            <View style={styles.field}>
              <ThemedText type="smallBold">Photo</ThemedText>
              <View style={styles.photoRow}>
                <View style={[styles.photoPreview, { borderColor: theme.border }]}>
                  {isUploading ? (
                    <ActivityIndicator />
                  ) : previewUrl ? (
                    <Image source={{ uri: previewUrl }} style={styles.photoPreviewImage} contentFit="cover" />
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      No photo
                    </ThemedText>
                  )}
                </View>
                <View style={styles.photoControls}>
                  {Platform.OS === 'web' && (
                    <Pressable
                      style={[styles.smallButton, { borderColor: theme.border }]}
                      onPress={() => fileInputRef.current?.click()}
                      disabled={isUploading}>
                      <ThemedText type="small" themeColor="primary">
                        Upload File
                      </ThemedText>
                    </Pressable>
                  )}
                  {!!imageUrl && (
                    <Pressable
                      style={[styles.smallButton, { borderColor: theme.border }]}
                      onPress={() => setImageUrl('')}
                      disabled={isUploading}>
                      <ThemedText type="small" themeColor="danger">
                        Remove
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>
              {Platform.OS === 'web' && (
                // Plain HTML file input, hidden and triggered by the button above —
                // simplest cross-browser way to pick a file without a native module.
                // Only ever rendered on web (guarded above), so the "input" host
                // element — not part of React Native's JSX types — is safe at runtime.
                // @ts-expect-error - web-only intrinsic DOM element
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                />
              )}
              <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="or paste an image URL (https://...)"
                autoCapitalize="none"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
              {uploadError && (
                <ThemedText type="small" themeColor="danger">
                  {uploadError}
                </ThemedText>
              )}
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">Product Name</ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. MacBook Air M2"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">Category</ThemedText>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="e.g. Laptop"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
              {categories.length > 0 && (
                <View style={styles.suggestionRow}>
                  {categories.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[
                        styles.suggestionChip,
                        {
                          borderColor: category === c ? theme.text : theme.border,
                          backgroundColor: category === c ? theme.text : 'transparent',
                        },
                      ]}>
                      <ThemedText
                        type="small"
                        style={{ color: category === c ? theme.background : theme.textSecondary, fontWeight: '700' }}>
                        {c}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">Description (optional)</ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Shown to shoppers on the product detail page"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.rowItem]}>
                <ThemedText type="smallBold">Price (฿)</ThemedText>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                />
              </View>
              <View style={[styles.field, styles.rowItem]}>
                <ThemedText type="smallBold">Stock</ThemedText>
                <TextInput
                  value={stock}
                  onChangeText={setStock}
                  placeholder="0"
                  keyboardType="number-pad"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                />
              </View>
            </View>

            {errors.length > 0 && (
              <View style={styles.errorBox}>
                {errors.map((err) => (
                  <ThemedText key={err} type="small" themeColor="danger">
                    • {err}
                  </ThemedText>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.cancelButton, { backgroundColor: theme.backgroundElement }]}
                onPress={onClose}
                disabled={busy}>
                <ThemedText type="smallBold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={handleSubmit}
                disabled={busy || isUploading}>
                <ThemedText type="smallBold" themeColor="primaryText">
                  {busy ? 'Saving…' : mode === 'add' ? 'Save product' : 'Update'}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    maxHeight: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: Spacing.three,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingTop: Spacing.one,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  photoControls: {
    gap: Spacing.one,
  },
  smallButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rowItem: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  errorBox: {
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
    marginTop: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
  cancelButton: {},
  primaryButton: {
    shadowColor: '#F2B705',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
