// src/components/chatbot-popup.tsx
// AI Chatbot floating popup component.
// Powered by Google Gemini API + MySQL real-time data retrieval.
// Visible to users as a floating button at bottom-right, expands into an interactive chat widget.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  productsApi,
  categoriesApi,
  ordersApi,
  claimsApi,
  chatbotApi,
  type ChatMessage,
} from '@/lib/api';

const BOT_NAME = 'hello test.t';
const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
  'AIzaSyCqKLMM1UywxKbCKKF1Uzg-1BDz_yW_2tA';

const INITIAL_GREETING =
  `สวัสดีครับ! ผมคือ **${BOT_NAME}** ผู้ช่วย AI ประจำร้าน ยินดีให้บริการครับ 😊\n\n` +
  'สามารถสอบถามเรื่องต่อไปนี้ได้เลยครับ:\n' +
  '• 🔍 **ค้นหาสินค้า** สเปก ราคา และสต็อกคงเหลือ\n' +
  '• 📦 **เช็คสถานะคำสั่งซื้อ** ของคุณ\n' +
  '• 🛠️ **ติดตามสถานะการเคลม** สินค้า\n' +
  '• 🏷️ **สอบถามโปรโมชั่น** และแนะนำสินค้า';

const QUICK_PROMPTS = [
  '🔥 แนะนำสินค้าขายดีในร้าน',
  '📦 เช็คสถานะคำสั่งซื้อของฉัน',
  '🎧 มีสินค้าหมวดหมู่ไหนบ้าง',
  '🛠️ ตรวจสอบสถานะการเคลมสินค้า',
];

// Generates response using real-time MySQL data from backend and Gemini API.
// Avoids server-side outbound port 443 firewall blocks by querying Gemini directly from client.
async function generateChatResponse(
  userQuestion: string,
  history: ChatMessage[],
  user: { id?: number; username?: string } | null
): Promise<string> {
  // Fetch real MySQL data from existing working backend endpoints
  const [products, categories, orders, claims] = await Promise.all([
    productsApi.list().catch(() => []),
    categoriesApi.list().catch(() => []),
    ordersApi.list().catch(() => []),
    claimsApi.list().catch(() => []),
  ]);

  const productsSummary = (products || [])
    .slice(0, 30)
    .map(
      (p) =>
        `- ${p.name} (รหัส #${p.id}, หมวดหมู่: ${p.category}): ราคา ${p.price} บาท` +
        (p.original_price ? ` (จากราคาปกติ ${p.original_price} บาท)` : '') +
        ` | สต็อกคงเหลือ: ${p.stock > 0 ? `${p.stock} ชิ้น` : 'หมดชั่วคราว'}` +
        (p.model ? ` | รุ่น: ${p.model}` : '') +
        (p.warranty_months ? ` | ประกัน: ${p.warranty_months} เดือน` : '')
    )
    .join('\n');

  const categoriesList = (categories || [])
    .map((c: any) => (typeof c === 'string' ? c : c.category))
    .filter(Boolean)
    .join(', ');

  const ordersSummary =
    orders && orders.length > 0
      ? orders
          .slice(0, 5)
          .map(
            (o) =>
              `- ออเดอร์ #${o.order_id}: สถานะ "${o.status}", ยอดรวม ${o.total_amount} บาท ` +
              `(การชำระ: ${o.payment_status || 'รอตรวจสอบ'}), รายการ: ${o.items?.map((i) => `${i.name} (x${i.quantity})`).join(', ') || '-'}`
          )
          .join('\n')
      : 'ยังไม่มีประวัติคำสั่งซื้อในระบบ';

  const claimsSummary =
    claims && claims.length > 0
      ? claims
          .slice(0, 5)
          .map(
            (c) =>
              `- เคลม #${c.claim_no}: สินค้า ${c.product_name_snapshot || '-'} (S/N: ${c.serial_no_snapshot || '-'}), สถานะ "${c.status}", อาการ: ${c.issue_detail || c.issue_type || '-'}`
          )
          .join('\n')
      : 'ไม่มีประวัติการส่งเคลมสินค้า';

  const systemPrompt =
    `คุณคือ "${BOT_NAME}" AI Chatbot ผู้ช่วยประจำร้านค้าออนไลน์ ${BOT_NAME}\n` +
    `ผู้ใช้ที่กำลังคุยด้วยคือคุณ "${user?.username || 'ลูกค้า'}"\n\n` +
    `หน้าที่ของคุณ:\n` +
    `1. ให้ข้อมูล แนะนำสินค้า สเปก ราคา และตรวจสอบจำนวนสต็อกคงเหลือจากข้อมูลจริงของร้านในระบบ\n` +
    `2. ตรวจสอบสถานะคำสั่งซื้อ ประวัติการสั่งซื้อของลูกค้า\n` +
    `3. ตรวจสอบสถานะการส่งเคลมสินค้าของลูกค้า\n` +
    `4. ตอบอย่างสุภาพ เป็นมิตร ใช้ภาษาไทยที่เข้าใจง่าย และลงท้ายด้วย "ครับ"\n` +
    `5. จัดรูปแบบข้อความเป็นระเบียบ ใช้ bullet points หรือตัวหนา (Markdown)\n` +
    `6. ห้ามแต่งตัวเลขราคาและสต็อกเองเด็ดขาด ต้องใช้ข้อมูลจากรายการด้านล่างนี้เท่านั้น\n\n` +
    `=== ข้อมูลสดจากฐานข้อมูลของร้าน (MySQL) ===\n` +
    `[รายการสินค้าในร้าน]:\n${productsSummary || 'ไม่มีสินค้า'}\n\n` +
    `[หมวดหมู่สินค้า]: ${categoriesList || 'ไม่ระบุ'}\n\n` +
    `[ประวัติคำสั่งซื้อของลูกค้าปัจจุบัน]:\n${ordersSummary}\n\n` +
    `[ประวัติการเคลมสินค้าของลูกค้าปัจจุบัน]:\n${claimsSummary}\n` +
    `============================================`;

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const h of history.slice(-6)) {
    contents.push({
      role: h.role,
      parts: [{ text: h.text }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: userQuestion }],
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1024,
      },
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'การเชื่อมต่อกับ Gemini API ไม่สำเร็จ');
  }

  const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return reply || 'ขออภัยครับ ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
}

export function ChatbotPopup() {
  const theme = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-0',
      role: 'model',
      text: INITIAL_GREETING,
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const isDesktop = width >= 640;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isOpen, messages]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const messageContent = (textToSend || inputText).trim();
      if (!messageContent || isSending) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: messageContent,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setIsSending(true);

      try {
        let replyText = '';
        try {
          // 1. Direct generation with real MySQL data & client internet (fastest, unblocked)
          replyText = await generateChatResponse(messageContent, messages, user);
        } catch (clientErr: any) {
          console.warn('Direct chat failed, attempting server endpoint fallback:', clientErr?.message);
          // 2. Fallback to server endpoint if needed
          const historyPayload = messages
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text }));
          const res = await chatbotApi.sendMessage(messageContent, historyPayload);
          replyText = res.reply;
        }

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'model',
          text: replyText,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, botMsg]);
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: `bot-err-${Date.now()}`,
          role: 'model',
          text:
            err?.message ||
            'ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI Chatbot กรุณาลองใหม่อีกครั้งครับ',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsSending(false);
      }
    },
    [inputText, isSending, messages, user]
  );

  const handleClearChat = useCallback(() => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        role: 'model',
        text: INITIAL_GREETING,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const renderFormattedText = (rawText: string, isUser: boolean) => {
    // Basic Markdown bold & bullet line formatting
    const lines = rawText.split('\n');
    return lines.map((line, idx) => {
      // Split on **bold**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <ThemedText
          key={idx}
          style={[
            styles.messageText,
            { color: isUser ? '#FFFFFF' : theme.text },
            line.startsWith('•') || line.startsWith('*') ? styles.bulletLine : undefined,
          ]}>
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <ThemedText
                  key={pIdx}
                  type="smallBold"
                  style={{ color: isUser ? '#FFFFFF' : theme.text }}>
                  {part.slice(2, -2)}
                </ThemedText>
              );
            }
            return part;
          })}
        </ThemedText>
      );
    });
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowBot]}>
        {!isUser && (
          <View style={[styles.botAvatar, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.botAvatarIcon}>🤖</ThemedText>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser
              ? [styles.userBubble, { backgroundColor: theme.primary }]
              : [
                  styles.botBubble,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ],
          ]}>
          {renderFormattedText(item.text, isUser)}
        </View>
      </View>
    );
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      {!isOpen && (
        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: theme.primary,
              bottom: Math.max(BottomTabInset + 20, 85),
            },
          ]}
          onPress={() => setIsOpen(true)}
          accessibilityLabel="เปิด AI Chatbot ผู้ช่วยร้านค้า">
          <ThemedText style={styles.fabIcon}>🤖</ThemedText>
          <View style={styles.fabBadge}>
            <View style={styles.onlineDot} />
            <ThemedText style={styles.fabBadgeText}>hello test.t AI</ThemedText>
          </View>
        </Pressable>
      )}

      {/* Chatbot Window / Popup */}
      {isOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.chatContainer,
            isDesktop ? styles.desktopChatWindow : styles.mobileChatWindow,
            {
              borderColor: theme.border,
              bottom: isDesktop ? Math.max(BottomTabInset + 20, 85) : 0,
            },
          ]}>
          <ThemedView type="cardBackground" style={styles.chatCard}>
            {/* Header */}
            <View
              style={[
                styles.header,
                { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border },
              ]}>
              <View style={styles.headerLeft}>
                <View style={[styles.headerAvatar, { backgroundColor: theme.primary }]}>
                  <ThemedText style={styles.headerAvatarText}>🤖</ThemedText>
                </View>
                <View>
                  <View style={styles.headerTitleRow}>
                    <ThemedText type="smallBold">hello test.t (AI Assistant)</ThemedText>
                    <View style={styles.headerOnlineBadge}>
                      <View style={styles.onlineDot} />
                      <ThemedText style={styles.onlineStatusText}>ออนไลน์</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.headerSubtitle}>
                    ผู้ช่วยร้านค้า hello test.t • ค้นหาข้อมูลสดจากระบบ
                  </ThemedText>
                </View>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  onPress={handleClearChat}
                  style={styles.headerBtn}
                  accessibilityLabel="ล้างบทสนทนา">
                  <ThemedText style={styles.headerBtnIcon}>🔄</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setIsOpen(false)}
                  style={[styles.headerBtn, styles.closeBtn]}
                  accessibilityLabel="ปิดหน้าต่างแชท">
                  <ThemedText style={styles.closeBtnText}>✕</ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Quick Prompt Chips */}
            <View style={[styles.chipsContainer, { borderBottomColor: theme.border }]}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={QUICK_PROMPTS}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.chipsList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.chip,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                    onPress={() => handleSend(item)}
                    disabled={isSending}>
                    <ThemedText type="small" style={styles.chipText}>
                      {item}
                    </ThemedText>
                  </Pressable>
                )}
              />
            </View>

            {/* Chat Messages */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => item.id || `msg-${index}`}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageListContent}
              style={styles.messageList}
            />

            {/* Typing Indicator */}
            {isSending && (
              <View style={styles.typingContainer}>
                <View style={[styles.typingBubble, { backgroundColor: theme.backgroundElement }]}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.typingText}>
                    กำลังค้นหาข้อมูลจากฐานข้อมูล...
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Input Bar */}
            <View
              style={[
                styles.inputBar,
                { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
              ]}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="พิมพ์ถามข้อมูลสินค้า หรือสถานะออเดอร์..."
                placeholderTextColor={theme.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleSend()}
                returnKeyType="send"
                editable={!isSending}
              />
              <Pressable
                style={[
                  styles.sendButton,
                  {
                    backgroundColor:
                      inputText.trim() && !isSending ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => handleSend()}
                disabled={!inputText.trim() || isSending}
                accessibilityLabel="ส่งข้อความ">
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.sendIcon}>➤</ThemedText>
                )}
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // FAB Button
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  fabIcon: {
    fontSize: 22,
  },
  fabBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },

  // Chat window container
  chatContainer: {
    position: 'absolute',
    zIndex: 10000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  desktopChatWindow: {
    right: 24,
    width: 400,
    height: 560,
    borderRadius: Spacing.four,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mobileChatWindow: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  chatCard: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 18,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerOnlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineStatusText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    padding: 6,
    borderRadius: 16,
  },
  headerBtnIcon: {
    fontSize: 14,
  },
  closeBtn: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5C6B78',
  },

  // Chips
  chipsContainer: {
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
  },
  chipsList: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 12,
  },

  // Messages
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowBot: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  botAvatarIcon: {
    fontSize: 14,
  },
  messageBubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  botBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bulletLine: {
    marginTop: 2,
  },

  // Typing
  typingContainer: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignSelf: 'flex-start',
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Input Bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 2,
  },
});
