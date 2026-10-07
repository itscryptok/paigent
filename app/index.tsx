import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GOLD = Colors.accent; // #D4AF37

function GlassButton({
  icon,
  label,
  onPress,
  half = true,
}: {
  icon?: React.ReactNode;
  label: string;
  onPress: () => void;
  half?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.glassBtn,
        half && styles.glassBtnHalf,
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon}
      <Text style={styles.glassBtnText}>{label}</Text>
    </Pressable>
  );
}

export default function LandingPage() {
  const insets = useSafeAreaInsets();
  const goCamera = () => router.push("/camera");
  const goLogin = () => router.push("/(auth)/login");
  const goRegister = () => router.push("/(auth)/register");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>
              Paigent<Text style={styles.logoGold}>.app</Text>
            </Text>
            <Text style={styles.tagline}>LIFE IS ART. ART IS LIFE.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={goLogin} hitSlop={10}>
              <Text style={styles.signIn}>Sign In</Text>
            </Pressable>
            <Pressable
              onPress={goRegister}
              style={({ pressed }) => [styles.sellBtn, pressed && { opacity: 0.85 }]}
            >
              <Feather name="shopping-bag" size={18} color="#0A0A0A" />
              <Text style={styles.sellBtnText}>Sell</Text>
            </Pressable>
          </View>
        </View>

        {/* HERO */}
        <ImageBackground
          source={require("@/assets/images/hero.jpg")}
          style={styles.hero}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["rgba(10,10,10,0.25)", "rgba(10,10,10,0.55)", "rgba(10,10,10,0.92)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroInner}>
            <View style={styles.apertureRow}>
              <View style={{ flex: 1 }} />
              <Feather name="aperture" size={52} color={GOLD} />
            </View>

            <View style={styles.pill}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>ARTWORK-AS-AN-ASSET MARKETPLACE</Text>
            </View>

            <Text style={styles.headline}>
              <Text style={styles.headlineWhite}>PAI</Text>
              <Text style={styles.headlineGold}>GENT</Text>
            </Text>

            <Text style={styles.subcopy}>
              Turn your photo or a photo shoot of anything into{" "}
              <Text style={styles.goldInline}>Artwork,</Text> sell it as an
              asset, or order a canvas print.
            </Text>

            <Pressable
              onPress={goRegister}
              style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
            >
              <Text style={styles.ctaBtnText}>Sell your Artwork</Text>
              <Feather name="arrow-right" size={22} color="#0A0A0A" />
            </Pressable>

            <View style={styles.grid}>
              <GlassButton label="Browse Artworks" onPress={goCamera} />
              <GlassButton
                icon={<Feather name="star" size={20} color="#fff" />}
                label="Create Artwork"
                onPress={goCamera}
              />
              <GlassButton
                icon={<Feather name="camera" size={20} color="#fff" />}
                label="Take Photo"
                onPress={goCamera}
              />
              <GlassButton
                icon={<Feather name="printer" size={20} color="#fff" />}
                label="Original Photo Print"
                onPress={goCamera}
              />
            </View>
            <View style={styles.gridSingle}>
              <GlassButton
                half={false}
                icon={<Feather name="book-open" size={20} color="#fff" />}
                label="Life is Art Blog"
                onPress={goCamera}
              />
            </View>

            <View style={styles.millionCard}>
              <Text style={styles.millionText}>
                <Text style={styles.goldInlineBold}>Take the Million dollar Photo</Text>
                <Text style={styles.millionWhite}>
                  {" "}of news-worthy events and turn it into a masterpiece through
                  artwork and canvas print that can be{" "}
                </Text>
                <Text style={styles.goldInlineBold}>sold at Auctions.</Text>
              </Text>
            </View>
          </View>
        </ImageBackground>
        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { alignItems: "center" },

  header: {
    width: "100%",
    maxWidth: 560,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  logo: { fontFamily: "Inter_700Bold", fontSize: 27, color: "#fff", letterSpacing: -0.5 },
  logoGold: { color: GOLD },
  tagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 10.5,
    color: "#8a8a8a",
    letterSpacing: 2.4,
    marginTop: 3,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  signIn: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: "#fff" },
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  sellBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#0A0A0A" },

  hero: { width: "100%", maxWidth: 560 },
  heroInner: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 10 },
  apertureRow: { flexDirection: "row", alignItems: "center", marginBottom: 18, paddingRight: 6 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.45)",
    backgroundColor: "rgba(10,10,10,0.45)",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    gap: 9,
    marginBottom: 20,
  },
  pillDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD },
  pillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12.5,
    color: GOLD,
    letterSpacing: 1.6,
  },

  headline: { marginBottom: 18 },
  headlineWhite: { fontFamily: "Inter_700Bold", fontSize: 68, color: "#fff", letterSpacing: -2 },
  headlineGold: { fontFamily: "Inter_700Bold", fontSize: 68, color: GOLD, letterSpacing: -2 },

  subcopy: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 21,
    lineHeight: 29,
    color: "#fff",
    marginBottom: 26,
  },
  goldInline: { color: GOLD },
  goldInlineBold: { color: GOLD, fontFamily: "Inter_700Bold" },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: GOLD,
    borderRadius: 18,
    paddingVertical: 17,
    paddingHorizontal: 26,
    alignSelf: "flex-start",
    marginBottom: 22,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#0A0A0A" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  gridSingle: { flexDirection: "row", marginBottom: 26 },
  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 18,
    paddingVertical: 19,
    paddingHorizontal: 14,
  },
  glassBtnHalf: { flexGrow: 1, flexBasis: "46%" },
  glassBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 17.5, color: "#fff" },

  millionCard: {
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
    backgroundColor: "rgba(10,10,10,0.55)",
    borderRadius: 22,
    padding: 22,
    marginBottom: 8,
  },
  millionText: { fontSize: 19, lineHeight: 28 },
  millionWhite: { fontFamily: "Inter_500Medium", color: "#fff" },
});
