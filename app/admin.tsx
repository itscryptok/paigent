import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "@/constants/colors";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

interface AdminOrder {
  id: number;
  artworkUrl: string;
  canvasSize: string;
  quantity: number;
  totalPrice: number;
  status: string;
  notes: string | null;
  userEmail: string;
  userName: string;
  userAddress: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: Colors.warning,
  processing: Colors.accent,
  fulfilled: Colors.success,
  cancelled: Colors.error,
};

const STATUS_OPTIONS = ["pending", "processing", "fulfilled", "cancelled"];

type AdminTab = "orders" | "settings";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");

  // Orders state
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeyMasked, setGeminiKeyMasked] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    AsyncStorage.getItem("admin_token").then((t) => {
      if (t) {
        setAdminToken(t);
        loadOrders(t);
        loadSettings(t);
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setIsLoggingIn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const response = await fetch(`${API_BASE}/admin/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert("Error", data.error || "Invalid password");
        return;
      }
      await AsyncStorage.setItem("admin_token", data.token);
      setAdminToken(data.token);
      loadOrders(data.token);
      loadSettings(data.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Connection failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loadOrders = async (token: string) => {
    setIsLoadingOrders(true);
    try {
      const response = await fetch(`${API_BASE}/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        setAdminToken(null);
        await AsyncStorage.removeItem("admin_token");
        return;
      }
      const data = await response.json();
      setOrders(data);
    } catch {
      Alert.alert("Error", "Failed to load orders");
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadSettings = async (token: string) => {
    setIsLoadingSettings(true);
    try {
      const response = await fetch(`${API_BASE}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.gemini_api_key) {
        setGeminiKeyMasked(data.gemini_api_key);
      }
    } catch {
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const saveGeminiKey = async () => {
    if (!geminiKey.trim() || !adminToken) return;
    setIsSavingKey(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const response = await fetch(`${API_BASE}/admin/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ key: "gemini_api_key", value: geminiKey.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setGeminiKey("");
      setGeminiKeyMasked(geminiKey.trim().slice(0, 6) + "••••••••••••••••••••••••••••••••••");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Gemini API key updated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const openOrder = (order: AdminOrder) => {
    setSelectedOrder(order);
    setEditNotes(order.notes || "");
    setEditStatus(order.status);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveOrder = async () => {
    if (!selectedOrder || !adminToken) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: editStatus, notes: editNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? data : o)));
      setSelectedOrder(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setAdminToken(null);
    await AsyncStorage.removeItem("admin_token");
  };

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    fulfilled: orders.filter((o) => o.status === "fulfilled").length,
    revenue: orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.totalPrice, 0),
  };

  if (!adminToken) {
    return (
      <View style={[styles.root, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
        {navigation.canGoBack() && (
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color={Colors.accent} />
          </Pressable>
        )}
        <Pressable style={styles.closeBtn} onPress={() => router.dismissAll()}>
          <Feather name="x" size={22} color={Colors.textSecondary} />
        </Pressable>

        <View style={styles.loginContainer}>
          <View style={styles.iconWrap}>
            <Feather name="shield" size={36} color={Colors.accent} />
          </View>
          <Text style={styles.loginTitle}>Admin Panel</Text>
          <Text style={styles.loginSub}>Canvas Print Order Management</Text>
          <Text style={styles.loginHint}>Default password: newflow</Text>

          <View style={styles.inputRow}>
            <Feather name="lock" size={18} color={Colors.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              placeholder="Admin password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={handleLogin}
            />
          </View>

          <Pressable
            style={[styles.loginBtn, isLoggingIn && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.loginBtnText}>Enter Admin</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {navigation.canGoBack() && (
            <Pressable style={styles.headerIconBtn} onPress={() => router.back()}>
              <Feather name="chevron-left" size={22} color={Colors.accent} />
            </Pressable>
          )}
          <View>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSub}>{orders.length} orders total</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.refreshBtn} onPress={() => { loadOrders(adminToken!); loadSettings(adminToken!); }}>
            <Feather name="refresh-cw" size={20} color={Colors.textSecondary} />
          </Pressable>
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={18} color={Colors.error} />
          </Pressable>
          <Pressable style={styles.closeTopBtn} onPress={() => router.dismissAll()}>
            <Feather name="x" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Total", value: stats.total },
          { label: "Pending", value: stats.pending, color: Colors.warning },
          { label: "Fulfilled", value: stats.fulfilled, color: Colors.success },
          { label: "Revenue", value: `$${stats.revenue.toFixed(0)}`, color: Colors.accent },
        ].map((stat) => (
          <View key={stat.label} style={styles.statBox}>
            <Text style={[styles.statValue, stat.color && { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "orders" && styles.tabActive]}
          onPress={() => setActiveTab("orders")}
        >
          <Feather name="package" size={15} color={activeTab === "orders" ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === "orders" && styles.tabTextActive]}>Orders</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "settings" && styles.tabActive]}
          onPress={() => setActiveTab("settings")}
        >
          <Feather name="settings" size={15} color={activeTab === "settings" ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === "settings" && styles.tabTextActive]}>Settings</Text>
        </Pressable>
      </View>

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <>
          {isLoadingOrders ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.accent} size="large" />
            </View>
          ) : (
            <FlatList
              data={orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <Pressable style={styles.orderCard} onPress={() => openOrder(item)}>
                  <View style={styles.orderCardLeft}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || Colors.textMuted }]} />
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderId}>#{item.id}</Text>
                      <Text style={styles.orderUser}>{item.userName}</Text>
                      <Text style={styles.orderEmail}>{item.userEmail}</Text>
                    </View>
                  </View>
                  <View style={styles.orderCardRight}>
                    <Text style={styles.orderPrice}>${item.totalPrice.toFixed(2)}</Text>
                    <Text style={styles.orderSize}>{item.canvasSize} × {item.quantity}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || Colors.textMuted) + "22" }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || Colors.textMuted }]}>
                        {item.status}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              )}
              contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 16 }]}
              showsVerticalScrollIndicator={false}
              scrollEnabled
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Feather name="inbox" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No orders yet</Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.settingsContent, { paddingBottom: bottomInset + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Gemini API Key Section */}
          <View style={styles.settingsSection}>
            <View style={styles.settingsSectionHeader}>
              <View style={styles.settingIconWrap}>
                <Feather name="cpu" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsSectionTitle}>Gemini API Key</Text>
                <Text style={styles.settingsSectionSub}>Used for AI photo-to-artwork generation</Text>
              </View>
            </View>

            {geminiKeyMasked ? (
              <View style={styles.currentKeyRow}>
                <Feather name="check-circle" size={14} color={Colors.success} />
                <Text style={styles.currentKeyText}>Key set: {geminiKeyMasked}</Text>
              </View>
            ) : (
              <View style={styles.currentKeyRow}>
                <Feather name="alert-circle" size={14} color={Colors.warning} />
                <Text style={[styles.currentKeyText, { color: Colors.warning }]}>No API key configured</Text>
              </View>
            )}

            <Text style={styles.settingsLabel}>
              {geminiKeyMasked ? "Update API Key" : "Enter API Key"}
            </Text>

            <View style={styles.keyInputRow}>
              <TextInput
                style={styles.keyInput}
                placeholder="AIza••••••••••••••••••••••••••••••"
                placeholderTextColor={Colors.textMuted}
                value={geminiKey}
                onChangeText={setGeminiKey}
                secureTextEntry={!showGeminiKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.eyeBtn} onPress={() => setShowGeminiKey((v) => !v)}>
                <Feather name={showGeminiKey ? "eye-off" : "eye"} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.settingsHint}>
              Get your key from{" "}
              <Text style={{ color: Colors.accent }}>aistudio.google.com/apikey</Text>
            </Text>

            <Pressable
              style={[styles.saveKeyBtn, (!geminiKey.trim() || isSavingKey) && { opacity: 0.5 }]}
              onPress={saveGeminiKey}
              disabled={!geminiKey.trim() || isSavingKey}
            >
              {isSavingKey ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <Feather name="save" size={16} color={Colors.bg} />
                  <Text style={styles.saveKeyBtnText}>Save API Key</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Feather name="info" size={14} color={Colors.textMuted} />
            <Text style={styles.infoText}>
              The Gemini API key is stored securely on the server and used for all AI artwork generation. Users never see this key.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Order Detail Modal */}
      <Modal visible={!!selectedOrder} animationType="slide" transparent presentationStyle="pageSheet">
        <View style={styles.modalRoot}>
          <View style={[styles.modalHeader, { paddingTop: 20 }]}>
            <Text style={styles.modalTitle}>Order #{selectedOrder?.id}</Text>
            <Pressable onPress={() => setSelectedOrder(null)}>
              <Feather name="x" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Customer</Text>
              <Text style={styles.detailValue}>{selectedOrder?.userName}</Text>
              <Text style={styles.detailSub}>{selectedOrder?.userEmail}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Order</Text>
              <Text style={styles.detailValue}>
                {selectedOrder?.canvasSize} canvas × {selectedOrder?.quantity}
              </Text>
              <Text style={[styles.detailValue, { color: Colors.accent }]}>
                ${selectedOrder?.totalPrice.toFixed(2)}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Status</Text>
              <View style={styles.statusOptionsRow}>
                {STATUS_OPTIONS.map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.statusOption, editStatus === s && { borderColor: STATUS_COLORS[s], backgroundColor: STATUS_COLORS[s] + "22" }]}
                    onPress={() => setEditStatus(s)}
                  >
                    <Text style={[styles.statusOptionText, { color: STATUS_COLORS[s] }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add internal notes..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </View>

            <Pressable
              style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
              onPress={saveOrder}
              disabled={isSaving}
            >
              {isSaving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  closeBtn: { position: "absolute", top: 20, right: 16, zIndex: 10, padding: 8 },
  backBtn: { position: "absolute", top: 20, left: 16, zIndex: 10, padding: 8 },
  loginContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accentDim, alignItems: "center", justifyContent: "center" },
  loginTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text },
  loginSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  loginHint: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, fontStyle: "italic" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
    width: "100%",
  },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 16, color: Colors.text },
  loginBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 30, alignItems: "center", width: "100%" },
  loginBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconBtn: { padding: 6 },
  refreshBtn: { padding: 10 },
  logoutBtn: { padding: 10 },
  closeTopBtn: { padding: 10 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: Colors.accentDim },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textMuted },
  tabTextActive: { color: Colors.accent },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, gap: 10 },
  orderCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  orderInfo: { gap: 2, flex: 1 },
  orderId: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  orderUser: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  orderEmail: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  orderCardRight: { alignItems: "flex-end", gap: 4 },
  orderPrice: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent },
  orderSize: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "capitalize" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 16, color: Colors.textMuted },
  settingsContent: { padding: 20, gap: 20 },
  settingsSection: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsSectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  settingsSectionSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  currentKeyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currentKeyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  settingsLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  keyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: 14,
    paddingRight: 4,
    height: 52,
  },
  keyInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  eyeBtn: { padding: 12 },
  settingsHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  saveKeyBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  saveKeyBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.bg },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, lineHeight: 18 },
  modalRoot: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  modalBody: { flex: 1 },
  detailSection: { gap: 6 },
  detailLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  detailValue: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  detailSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  statusOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusOptionText: { fontFamily: "Inter_600SemiBold", fontSize: 13, textTransform: "capitalize" },
  notesInput: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 30, alignItems: "center" },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.bg },
});
