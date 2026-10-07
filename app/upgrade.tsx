import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";

import { Colors } from "@/constants/colors";
import { useApp } from "@/context/AppContext";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

const FEATURES = [
  { icon: "camera", text: "Unlimited photo captures" },
  { icon: "zap", text: "20 AI artwork generates per month" },
  { icon: "sliders", text: "10 prompt refinements per month" },
  { icon: "star", text: "Priority processing queue" },
  { icon: "download-cloud", text: "High-res artwork downloads" },
];

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { token, user, refreshUser } = useApp();
  const [loading, setLoading] = useState(false);
  const [buyingPack, setBuyingPack] = useState<"pack20" | "pack50" | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubscribe = useCallback(async () => {
    if (!token) {
      Alert.alert("Login Required", "Please log in to upgrade to Premium.", [
        { text: "Log In", onPress: () => router.replace("/(auth)/login") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await fetch(`${API_BASE}/auth/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: "monthly" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      await WebBrowser.openBrowserAsync(data.url, {
        toolbarColor: "#0A0A0A",
        controlsColor: "#D4AF37",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });

      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, refreshUser]);

  const buyCredits = useCallback(async (pack: "pack20" | "pack50") => {
    if (!token) {
      Alert.alert("Login Required", "Please log in first.", [
        { text: "Log In", onPress: () => router.replace("/(auth)/login") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    setBuyingPack(pack);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const res = await fetch(`${API_BASE}/photos/buy-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pack }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");

      await WebBrowser.openBrowserAsync(data.url, {
        toolbarColor: "#0A0A0A",
        controlsColor: "#D4AF37",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });

      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong. Please try again.");
    } finally {
      setBuyingPack(null);
    }
  }, [token, refreshUser]);

  return (
    <View style={[styles.root, { backgroundColor: Colors.bg }]}>
      {navigation.canGoBack() && (
        <Pressable style={[styles.backBtn, { top: topInset + 16 }]} onPress={() => router.back()}>
          <Feather name="chevron-left" size={24} color={Colors.accent} />
        </Pressable>
      )}
      <Pressable style={[styles.closeBtn, { top: topInset + 16 }]} onPress={() => router.dismissAll()}>
        <Feather name="x" size={18} color={Colors.accent} />
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 60, paddingBottom: bottomInset + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconRing}>
            <Feather name="aperture" size={36} color={Colors.accent} />
          </View>
          <Text style={styles.title}>PAIGENT PREMIUM</Text>
          <Text style={styles.subtitle}>Unlock your creativity</Text>
        </View>

        {/* Price card */}
        {!user?.isPremium && (
          <View style={styles.priceCard}>
            <Text style={styles.priceAmount}>$3.99</Text>
            <Text style={styles.pricePer}>/ month</Text>
            <Text style={styles.priceNote}>Cancel anytime · Secure Stripe checkout</Text>
          </View>
        )}

        {/* Features */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Everything included</Text>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <View style={styles.featureCheck}>
                <Feather name="check" size={12} color={Colors.bg} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Subscribe CTA — only shown for non-premium */}
        {!user?.isPremium && (
          <>
            <Pressable
              style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }, loading && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} />
              ) : (
                <>
                  <Feather name="zap" size={18} color={Colors.bg} />
                  <Text style={styles.ctaBtnText}>Subscribe for $3.99 / month</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.terms}>
              Premium unlocks for 30 days and renews monthly.{"\n"}
              Cancel anytime by not renewing.
            </Text>
          </>
        )}

        {/* Already Premium — show credit pack options */}
        {user?.isPremium && (
          <View style={{ width: "100%", marginTop: 8, gap: 16 }}>
            <View style={styles.premiumActiveBadge}>
              <Feather name="check-circle" size={16} color={Colors.accent} />
              <Text style={styles.premiumActiveText}>Premium is active on your account</Text>
            </View>

            <Text style={styles.creditsHeading}>Need more generates?</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: -8 }}>
              Credit packs never expire and stack on top of your monthly allowance.
            </Text>

            {/* Pack 20 */}
            <Pressable
              style={[styles.packCard]}
              onPress={() => buyCredits("pack20")}
              disabled={buyingPack !== null}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.packName}>20 Generates</Text>
                <Text style={styles.packDesc}>One-time · never expires</Text>
              </View>
              {buyingPack === "pack20" ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <View style={styles.packBuyBtn}>
                  <Text style={styles.packBuyBtnText}>$4.99</Text>
                </View>
              )}
            </Pressable>

            {/* Pack 50 */}
            <Pressable
              style={[styles.packCard, styles.packCardBest]}
              onPress={() => buyCredits("pack50")}
              disabled={buyingPack !== null}
            >
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.packName, { color: Colors.accent }]}>50 Generates</Text>
                <Text style={[styles.packDesc, { color: Colors.accentMuted }]}>One-time · never expires</Text>
              </View>
              {buyingPack === "pack50" ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <View style={styles.packBuyBtn}>
                  <Text style={styles.packBuyBtnText}>$9.99</Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.terms}>Secure checkout via Stripe. Credits added instantly.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(10,10,10,0.75)",
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(10,10,10,0.75)",
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  scroll: { paddingHorizontal: 24, alignItems: "center" },

  header: { alignItems: "center", marginBottom: 28, gap: 10 },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accentDim,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.accent, letterSpacing: 2 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary },

  priceCard: {
    width: "100%",
    backgroundColor: Colors.accentDim,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    gap: 4,
  },
  priceAmount: { fontFamily: "Inter_700Bold", fontSize: 48, color: Colors.accent },
  pricePer: { fontFamily: "Inter_400Regular", fontSize: 16, color: Colors.accentMuted },
  priceNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 6 },

  featuresCard: {
    width: "100%",
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 14,
    marginBottom: 24,
  },
  featuresTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text, flex: 1 },

  ctaBtn: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: Colors.accent,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.bg },

  terms: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },

  premiumActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.accentDim,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
  },
  premiumActiveText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent },
  creditsHeading: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, textAlign: "center" },

  packCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 18,
    gap: 12,
    position: "relative",
    overflow: "hidden",
  },
  packCardBest: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  bestValueBadge: {
    position: "absolute",
    top: 10,
    right: -20,
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 3,
    transform: [{ rotate: "35deg" }],
  },
  bestValueText: { fontFamily: "Inter_700Bold", fontSize: 9, color: Colors.bg, letterSpacing: 1 },
  packName: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  packDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  packBuyBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  packBuyBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.bg },
});
