import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Dimensions,
  Modal,
  Share,
  Linking,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { Colors } from "@/constants/colors";
import { useApp, CapturedPhoto } from "@/context/AppContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const TINY_SIZE = 64;
const CANVAS_SIZES = {
  small: { label: '16" × 20"', price: 49.99 },
  medium: { label: '18" × 24"', price: 59.99 },
  large: { label: '24" × 36"', price: 89.99 },
};
const MAX_FREE_PHOTOS = 4;
const MAX_GUEST_PHOTOS = 2;
const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";
const WEB_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:4000";

type OverlayState = "none" | "photo-detail" | "enlarged" | "cart" | "linktree";
type SelectedSize = "small" | "medium" | "large";

function ZoomableImage({ uri, width, height, onZoomChange }: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [isZoomed, setIsZoomed] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function resetZoom() {
    "worklet";
    scale.value = withSpring(1, { damping: 20 });
    savedScale.value = 1;
    translateX.value = withSpring(0, { damping: 20 });
    translateY.value = withSpring(0, { damping: 20 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }

  function notifyZoomed(zoomed: boolean) {
    setIsZoomed(zoomed);
    onZoomChange(zoomed);
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.max(1, Math.min(5, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        resetZoom();
        runOnJS(notifyZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(notifyZoomed)(true);
      }
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
        runOnJS(notifyZoomed)(false);
      } else {
        scale.value = withSpring(2.5, { damping: 20 });
        savedScale.value = 2.5;
        runOnJS(notifyZoomed)(true);
      }
    });

  // Only include panGesture when zoomed — at scale=1 it would block FlatList swipes
  const composed = isZoomed
    ? Gesture.Race(doubleTap, Gesture.Simultaneous(pinchGesture, panGesture))
    : Gesture.Race(doubleTap, pinchGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width, height, overflow: "hidden" }}>
        <Animated.Image
          source={{ uri }}
          style={[{ width, height }, animStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const { photos, addPhoto, updatePhoto, removePhoto, cartItems, addToCart, user, token, logout, refreshUser } = useApp();

  const [cameraActive, setCameraActive] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"back" | "front">("back");
  const [zoom, setZoom] = useState(0);
  const [showZoomLabel, setShowZoomLabel] = useState(false);
  const zoomShared = useSharedValue(0);
  const gestureStartZoom = useSharedValue(0);
  const zoomLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [timerDuration, setTimerDuration] = useState<0 | 5 | 10>(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function flashZoomLabel() {
    setShowZoomLabel(true);
    if (zoomLabelTimer.current) clearTimeout(zoomLabelTimer.current);
    zoomLabelTimer.current = setTimeout(() => setShowZoomLabel(false), 1500);
  }

  function applyZoom(v: number) {
    setZoom(v);
    flashZoomLabel();
  }

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { gestureStartZoom.value = zoomShared.value; })
    .onUpdate((e) => {
      const next = Math.min(1, Math.max(0, gestureStartZoom.value + (e.scale - 1) * 0.5));
      zoomShared.value = next;
      runOnJS(applyZoom)(next);
    });

  const flipCamera = useCallback(() => {
    setCameraFacing((f) => (f === "back" ? "front" : "back"));
    setZoom(0);
    zoomShared.value = 0;
    gestureStartZoom.value = 0;
    setShowZoomLabel(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const cycleTimer = useCallback(() => {
    setTimerDuration((d) => (d === 0 ? 5 : d === 5 ? 10 : 0));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cancelTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerCountdown(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const hasFlipped = useSharedValue(false);
  const swipeGesture = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => { hasFlipped.value = false; })
    .onUpdate((e) => {
      if (!hasFlipped.value && Math.abs(e.translationY) > 70) {
        hasFlipped.value = true;
        runOnJS(flipCamera)();
      }
    })
    .minDistance(10);

  const cameraGesture = Gesture.Simultaneous(pinchGesture, swipeGesture);

  useEffect(() => () => { if (zoomLabelTimer.current) clearTimeout(zoomLabelTimer.current); }, []);
  const [torchOn, setTorchOn] = useState(false);
  const [infoModal, setInfoModal] = useState<null | "howItWorks" | "aboutUs">(null);
  const [overlay, setOverlay] = useState<OverlayState>("none");

  // Restore camera when returning from login/register without completing auth
  useFocusEffect(
    useCallback(() => {
      if (overlay === "none") {
        setCameraActive(true);
      }
    }, [overlay])
  );
  const [selectedPhoto, setSelectedPhoto] = useState<CapturedPhoto | null>(null);
  const [enlargedUri, setEnlargedUri] = useState<string | null>(null);
  const [enlargedList, setEnlargedList] = useState<string[]>([]);
  const [enlargedPhotoList, setEnlargedPhotoList] = useState<CapturedPhoto[]>([]);
  const [enlargedIndex, setEnlargedIndex] = useState(0);
  const [enlargedScrollEnabled, setEnlargedScrollEnabled] = useState(true);
  const enlargedListRef = useRef<FlatList<string>>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [promptTrials, setPromptTrials] = useState(1);
  const [selectedSize, setSelectedSize] = useState<SelectedSize>("medium");
  const [quantity, setQuantity] = useState(1);
  const [cartForArtwork, setCartForArtwork] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string; warn?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [creditPackModalVisible, setCreditPackModalVisible] = useState(false);
  const [buyingCreditPack, setBuyingCreditPack] = useState<"pack20" | "pack50" | null>(null);

  useEffect(() => {
    setPromptTrials(user?.isPremium ? 10 : 1);
  }, [user?.isPremium, user?.id]);

  const showToast = useCallback((message: string, warn = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, warn });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const openPhotoDetail = useCallback((photo: CapturedPhoto) => {
    setSelectedPhoto(photo);
    setOverlay("photo-detail");
    setCameraActive(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const openEnlarged = useCallback((uri: string, list: string[], photoList?: CapturedPhoto[]) => {
    const idx = list.indexOf(uri);
    setEnlargedList(list);
    setEnlargedPhotoList(photoList ?? []);
    setEnlargedIndex(idx >= 0 ? idx : 0);
    setEnlargedUri(uri);
    setOverlay("enlarged");
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay("none");
    setSelectedPhoto(null);
    setEnlargedUri(null);
    setEnlargedList([]);
    setEnlargedPhotoList([]);
    setEnlargedIndex(0);
    setCartForArtwork(null);
    setCameraActive(true);
  }, []);

  const goBackFromEnlarged = useCallback(() => {
    setOverlay("photo-detail");
    setEnlargedUri(null);
    setEnlargedList([]);
    setEnlargedPhotoList([]);
    setEnlargedIndex(0);
  }, []);

  const openLinktree = useCallback(() => {
    setCameraActive(false);
    setOverlay("linktree");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const closeLinktree = useCallback(() => {
    setOverlay("none");
    setCameraActive(true);
  }, []);

  const doCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const photoId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true, shutterSound: false });
      if (!photo) return;

      // Guests: add photo but skip artwork generation entirely — show login wall in the detail view
      if (!user) {
        addPhoto({
          id: photoId,
          uri: photo.uri,
          imageBase64: photo.base64 ?? undefined,
          artworkUri: null,
          artworkUris: [],
          isGenerating: false,
          generateError: "guest",
          sessionId: null,
          timestamp: Date.now(),
        });
        return;
      }

      // Logged-in user: add photo and start generating
      addPhoto({
        id: photoId,
        uri: photo.uri,
        imageBase64: photo.base64 ?? undefined,
        artworkUri: null,
        artworkUris: [],
        isGenerating: true,
        generateError: null,
        sessionId: null,
        timestamp: Date.now(),
      });

      const response = await fetch(`${API_BASE}/photos/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: photo.base64 }),
      });

      const errData = await response.json() as any;

      if (!response.ok) {
        const code = errData.code as string | undefined;
        updatePhoto(photoId, { isGenerating: false, generateError: code || "error" });

        if (code === "CREDIT_PACK") {
          setCreditPackModalVisible(true);
        } else if (errData.upgradeRequired) {
          Alert.alert(
            "Monthly Limit Reached",
            errData.error || "Upgrade to Premium for more artwork generates.",
            [
              { text: "Upgrade — $3.99/mo", onPress: () => router.push("/upgrade") },
              { text: "Cancel", style: "cancel" as const },
            ]
          );
        } else {
          Alert.alert("Limit Reached", errData.error || "Your limit resets next month.", [{ text: "OK" }]);
        }
        return;
      }

      updatePhoto(photoId, {
        artworkUri: errData.artworkUrl,
        artworkUris: [errData.artworkUrl],
        isGenerating: false,
        generateError: null,
        sessionId: errData.sessionId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to generate artwork.");
      updatePhoto(photoId, { isGenerating: false, generateError: "error" });
    }
  }, [photos, user, addPhoto, updatePhoto, token, showToast]);

  const buyCreditsFromMobile = useCallback(async (pack: "pack20" | "pack50") => {
    if (!token) {
      router.push("/(auth)/login");
      return;
    }
    setBuyingCreditPack(pack);
    try {
      const res = await fetch(`${API_BASE}/photos/buy-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      await WebBrowser.openBrowserAsync(data.url, {
        toolbarColor: "#0A0A0A",
        controlsColor: "#D4AF37",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
      await refreshUser();
      setCreditPackModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Credits added! You can generate new artwork now.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong. Please try again.");
    } finally {
      setBuyingCreditPack(null);
    }
  }, [token, refreshUser, showToast]);

  const handleCapture = useCallback(() => {
    if (!cameraRef.current) return;

    // Guest limit — max 2 shots without login
    if (!user && photos.length >= MAX_GUEST_PHOTOS) {
      Alert.alert(
        "Sign In to Continue",
        "Create a free account to take more photos and generate AI artwork.",
        [
          { text: "Sign Up", onPress: () => { setCameraActive(false); router.push("/(auth)/register"); } },
          { text: "Log In", onPress: () => { setCameraActive(false); router.push("/(auth)/login"); } },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }

    if (timerDuration === 0) {
      doCapture();
      return;
    }

    // Start countdown
    let remaining = timerDuration;
    setTimerCountdown(remaining);
    timerIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current!);
        timerIntervalRef.current = null;
        setTimerCountdown(null);
        doCapture();
      } else {
        setTimerCountdown(remaining);
      }
    }, 1000);
  }, [timerDuration, doCapture, user, photos]);

  const handleGenerateWithPrompt = useCallback(async () => {
    if (!selectedPhoto || !customPrompt.trim()) return;
    if (promptTrials <= 0) {
      Alert.alert("No trials left", "You've used all your prompt trials for this image.");
      return;
    }
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPromptTrials((t) => t - 1);

    updatePhoto(selectedPhoto.id, { isGenerating: true });

    try {
      // Always ensure the original image is attached — fall back to reading from disk if base64 is missing
      let imageBase64 = selectedPhoto.imageBase64;
      if (!imageBase64 && selectedPhoto.uri) {
        imageBase64 = await FileSystem.readAsStringAsync(selectedPhoto.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      if (!imageBase64) {
        throw new Error("Original photo data is unavailable. Please retake the photo.");
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/photos/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          imageBase64,
          prompt: customPrompt.trim(),
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        updatePhoto(selectedPhoto.id, { isGenerating: false });
        setPromptTrials(0);
        const code = data.code as string | undefined;
        if (code === "CREDIT_PACK") {
          setCreditPackModalVisible(true);
        } else if (data.upgradeRequired) {
          Alert.alert(
            "Monthly Limit Reached",
            data.error || "Upgrade to Premium for more generates.",
            [
              { text: "Upgrade — $3.99/mo", onPress: () => router.push("/upgrade") },
              { text: "Cancel", style: "cancel" as const },
            ]
          );
        } else {
          Alert.alert("Limit Reached", data.error || "Your limit resets next month.", [{ text: "OK" }]);
        }
        return;
      }

      const newUris = [...(selectedPhoto.artworkUris || []), data.artworkUrl];
      updatePhoto(selectedPhoto.id, {
        artworkUris: newUris,
        artworkUri: data.artworkUrl,
        isGenerating: false,
      });
      setSelectedPhoto((prev) =>
        prev ? { ...prev, artworkUris: newUris, artworkUri: data.artworkUrl, isGenerating: false } : null
      );
      setCustomPrompt("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed");
      updatePhoto(selectedPhoto.id, { isGenerating: false });
    }
  }, [selectedPhoto, customPrompt, promptTrials, user, updatePhoto, token]);

  const openCart = useCallback((artworkUri: string) => {
    if (!user) {
      setOverlay("none");
      setCameraActive(false);
      setTimeout(() => router.push("/(auth)/login"), 100);
      return;
    }
    setCartForArtwork(artworkUri);
    setOverlay("cart");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [user]);

  const handleAddToCart = useCallback(() => {
    if (!cartForArtwork) return;
    addToCart({ artworkUri: cartForArtwork, canvasSize: selectedSize, quantity });
    setOverlay("photo-detail");
    setCartForArtwork(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Added to Cart", "Your canvas print has been added to the cart!");
  }, [cartForArtwork, selectedSize, quantity, addToCart]);

  const handleShare = useCallback(async (uri: string) => {
    try {
      await Share.share({ url: uri, message: "Come check out my artwork at paigent.app. You can order a canvas print as well!" });
    } catch {}
  }, []);

  const handleDownload = useCallback(async (uri: string) => {
    if (Platform.OS === "web") {
      Alert.alert("Download", "Tap and hold the image to save on web.");
      return;
    }
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
      if (!granted) { Alert.alert("Permission denied", "Please allow photo library access in Settings."); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved!", "Image saved to your gallery.");
    } catch (e: any) {
      if (e?.message?.includes("Expo Go") || e?.message?.includes("development build")) {
        Alert.alert("Not available in Expo Go", "Saving to gallery works in the full app. Your image is still visible in the app.");
      } else {
        Alert.alert("Error", "Could not save image.");
      }
    }
  }, []);

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.bg }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.bg, paddingTop: topInset }]}>
        <Image
          source={require("../assets/images/icon.png")}
          style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 28 }}
          resizeMode="contain"
        />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permText}>PAIGENT needs camera access to capture your photos.</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Enable Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* Camera View */}
      {cameraActive && (
        <GestureDetector gesture={cameraGesture}>
          <View style={StyleSheet.absoluteFill}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={cameraFacing} enableTorch={torchOn} zoom={zoom} mute />
            {/* Dark overlay gradient at top/bottom */}
            <View style={[styles.topGradient, { height: topInset + 100 }]} />
            <View style={[styles.bottomGradient, { height: bottomInset + 160 }]} />
            {/* Zoom label */}
            {showZoomLabel && (
              <View style={{ position: "absolute", bottom: bottomInset + 170, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                  {(1 + zoom * 4).toFixed(1)}×
                </Text>
              </View>
            )}
          </View>
        </GestureDetector>
      )}

      {!cameraActive && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg }]} />
      )}

      {/* TOP BAR */}
      {overlay === "none" && (
        <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>PAI</Text>
            <Text style={styles.logoDot}>GENT</Text>
          </View>
          {/* Cart Badge — only shown when there are items */}
          {cartItems.length > 0 && (
            <Pressable
              style={styles.cartTopBtn}
              onPress={() =>
                Alert.alert(
                  `Cart (${cartItems.length} item${cartItems.length > 1 ? "s" : ""})`,
                  "Open any artwork and tap the cart icon to review your order.",
                  [{ text: "OK" }]
                )
              }
            >
              <Feather name="shopping-cart" size={22} color={Colors.accent} />
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* MAIN CAMERA AREA + TINY STRIP */}
      {overlay === "none" && (
        <View style={[styles.mainArea, { paddingTop: topInset + 70, paddingBottom: bottomInset + 120 }]}>
          {/* Photo Strip - right side */}
          <View style={styles.photoStrip}>
            {/* Profile icon */}
            <Pressable style={styles.profileBtn} onPress={openLinktree}>
              <Feather name="user" size={32} color={Colors.text} />
            </Pressable>

            {/* Tiny previews */}
            <FlatList
              data={photos}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.tinyContainer}
                  onPress={() => openPhotoDetail(item)}
                >
                  <Image source={{ uri: item.uri }} style={styles.tinyImg} />
                  {item.isGenerating && (
                    <View style={styles.tinyGenerating}>
                      <ActivityIndicator size="small" color={Colors.accent} />
                    </View>
                  )}
                  {item.artworkUri && !item.isGenerating && (
                    <View style={styles.tinyCheckmark}>
                      <Feather name="check" size={10} color={Colors.bg} />
                    </View>
                  )}
                </Pressable>
              )}
              scrollEnabled={!!photos.length}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 8 }}
            />

            {/* Photo count */}
            {photos.length > 0 && (
              <View style={styles.photoCount}>
                <Text style={styles.photoCountText}>{photos.length}/{MAX_FREE_PHOTOS}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* CAPTURE BUTTON + CAMERA CONTROLS */}
      {overlay === "none" && (
        <View style={[styles.captureArea, { paddingBottom: bottomInset + 24 }]}>
          {/* Timer toggle — above shutter row */}
          <Pressable
            style={styles.timerToggleBtn}
            onPress={cycleTimer}
          >
            <Feather name="clock" size={15} color={timerDuration > 0 ? Colors.accent : Colors.textSecondary} />
            <Text style={[styles.timerToggleText, timerDuration > 0 && { color: Colors.accent }]}>
              {timerDuration === 0 ? "Off" : `${timerDuration}s`}
            </Text>
          </Pressable>

          {/* Bottom row: flash | shutter | flip */}
          <View style={styles.captureRow}>
            {/* Flashlight */}
            <Pressable
              style={styles.cameraCtrlBtn}
              onPress={() => setTorchOn((t) => !t)}
            >
              <Feather
                name={torchOn ? "zap" : "zap-off"}
                size={24}
                color={torchOn ? Colors.accent : Colors.text}
              />
            </Pressable>

            {/* Shutter */}
            <Pressable
              style={({ pressed }) => [styles.captureBtn, pressed && { transform: [{ scale: 0.94 }] }]}
              onPress={handleCapture}
            >
              <View style={styles.captureInner} />
            </Pressable>

            {/* Flip camera */}
            <Pressable
              style={styles.cameraCtrlBtn}
              onPress={flipCamera}
            >
              <Feather name="refresh-cw" size={24} color={Colors.text} />
            </Pressable>
          </View>
        </View>
      )}

      {/* COUNTDOWN OVERLAY */}
      {timerCountdown !== null && (
        <Pressable
          style={styles.countdownOverlay}
          onPress={cancelTimer}
        >
          <Text style={styles.countdownNumber}>{timerCountdown}</Text>
          <Text style={styles.countdownCancel}>TAP TO CANCEL</Text>
        </Pressable>
      )}

      {/* LINKTREE OVERLAY */}
      {overlay === "linktree" && (
        <View style={[StyleSheet.absoluteFill, styles.linktreeOverlay, { paddingTop: topInset + 20, paddingBottom: bottomInset + 30 }]}>
          <Pressable style={[styles.overlayCloseBtn, { top: topInset + 20 }]} onPress={closeLinktree}>
            <Feather name="x" size={20} color={Colors.accent} />
          </Pressable>

          <View style={styles.linktreeContent}>
            <View style={styles.linktreeAvatar}>
              <Feather name="aperture" size={40} color={Colors.accent} />
            </View>
            <Text style={styles.linktreeBrand}>PAIGENT</Text>
            <Text style={styles.linktreeTagline}>Your moments, as art</Text>

            <View style={styles.linktreeLinks}>
              {!user ? (
                <>
                  <Pressable
                    style={styles.linktreePrimaryLink}
                    onPress={() => { closeLinktree(); router.push("/(auth)/register"); }}
                  >
                    <Text style={styles.linktreePrimaryLinkText}>SIGN UP</Text>
                  </Pressable>

                  <Pressable
                    style={styles.linktreeSecondaryLink}
                    onPress={() => { closeLinktree(); router.push("/(auth)/login"); }}
                  >
                    <Text style={styles.linktreeSecondaryLinkText}>LOGIN</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.userInfoBox}>
                  <Feather name="check-circle" size={24} color={Colors.success} />
                  <Text style={styles.userInfoName}>{user.name}</Text>
                  <Text style={styles.userInfoEmail}>{user.email}</Text>
                  {user.isPremium && <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>PREMIUM</Text></View>}
                </View>
              )}

              <Pressable
                style={[styles.linktreeLink, { borderColor: Colors.accent + "44", backgroundColor: Colors.accentDim }]}
                onPress={() => { closeLinktree(); Linking.openURL(`${WEB_BASE}/photos`); }}
              >
                <Feather name="image" size={18} color={Colors.accent} />
                <Text style={[styles.linktreeLinkText, { color: Colors.accent }]}>Browse Photo Marketplace</Text>
              </Pressable>

              <Pressable
                style={styles.linktreeLink}
                onPress={() => { closeLinktree(); Linking.openURL(`${WEB_BASE}/sell`); }}
              >
                <Feather name="camera" size={18} color={Colors.textSecondary} />
                <Text style={styles.linktreeLinkText}>Sell Your Photos</Text>
              </Pressable>

              <Pressable style={styles.linktreeLink} onPress={() => setInfoModal("howItWorks")}>
                <Feather name="help-circle" size={18} color={Colors.textSecondary} />
                <Text style={styles.linktreeLinkText}>How It Works</Text>
              </Pressable>

              <Pressable style={styles.linktreeLink} onPress={() => setInfoModal("aboutUs")}>
                <Feather name="info" size={18} color={Colors.textSecondary} />
                <Text style={styles.linktreeLinkText}>About Us</Text>
              </Pressable>

              <Pressable style={styles.linktreeLink} onPress={() => Linking.openURL("https://x.com/paigentapp")}>
                <Feather name="twitter" size={18} color={Colors.textSecondary} />
                <Text style={styles.linktreeLinkText}>Follow us on X @paigentapp</Text>
              </Pressable>

              {user && !user.isPremium && (
                <Pressable
                  style={[styles.linktreeLink, { borderColor: Colors.accent + "55", backgroundColor: Colors.accentDim }]}
                  onPress={() => { closeLinktree(); router.push("/upgrade"); }}
                >
                  <Feather name="zap" size={18} color={Colors.accent} />
                  <Text style={[styles.linktreeLinkText, { color: Colors.accent, fontFamily: "Inter_700Bold" }]}>Upgrade to Premium</Text>
                </Pressable>
              )}

              {user && (
                <Pressable style={[styles.linktreeLink, { borderColor: Colors.error + "33" }]} onPress={() => { logout(); closeLinktree(); }}>
                  <Feather name="log-out" size={18} color={Colors.error} />
                  <Text style={[styles.linktreeLinkText, { color: Colors.error }]}>Sign Out</Text>
                </Pressable>
              )}
            </View>

            {/* Social Icons */}
            <View style={styles.socialRow}>
              <Pressable style={styles.socialBtn} onPress={() => Alert.alert("X/Twitter", "Coming soon - add your link")}>
                <Text style={styles.socialLabel}>𝕏</Text>
              </Pressable>
              <Pressable style={styles.socialBtn} onPress={() => Alert.alert("Instagram", "Coming soon - add your link")}>
                <Feather name="instagram" size={22} color={Colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.socialBtn} onPress={() => Alert.alert("TikTok", "Coming soon - add your link")}>
                <Feather name="music" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

          </View>
        </View>
      )}

      {/* PHOTO DETAIL OVERLAY */}
      {overlay === "photo-detail" && selectedPhoto && (
        <View style={[StyleSheet.absoluteFill, styles.detailOverlay, { paddingTop: topInset, paddingBottom: bottomInset + 16 }]}>
          <ScrollView style={styles.detailScroll} contentContainerStyle={{ paddingTop: 72, paddingHorizontal: 16, paddingBottom: 32 }}>
            {/* Side by side images */}
            {(() => {
              const boxList = [
                selectedPhoto.uri,
                ...(selectedPhoto.artworkUris?.length
                  ? selectedPhoto.artworkUris
                  : selectedPhoto.artworkUri
                  ? [selectedPhoto.artworkUri]
                  : []),
              ];
              return (
            <View style={styles.imageRow}>
              {/* Original */}
              <Pressable
                style={styles.imageBox}
                onPress={() => openEnlarged(selectedPhoto.uri, boxList)}
              >
                <Image source={{ uri: selectedPhoto.uri }} style={styles.detailImage} resizeMode="cover" />
                <View style={styles.imageLabel}><Text style={styles.imageLabelText}>Original</Text></View>
              </Pressable>

              {/* Artwork */}
              <Pressable
                style={styles.imageBox}
                onPress={() => {
                  if (selectedPhoto.artworkUri) {
                    openEnlarged(selectedPhoto.artworkUri, boxList);
                  }
                }}
              >
                {selectedPhoto.isGenerating ? (
                  <View style={[styles.detailImage, styles.generatingBox]}>
                    <ActivityIndicator color={Colors.accent} size="large" />
                    <Text style={styles.generatingText}>Creating art...</Text>
                  </View>
                ) : selectedPhoto.artworkUri ? (
                  <>
                    <Image source={{ uri: selectedPhoto.artworkUri }} style={styles.detailImage} resizeMode="cover" />
                    <View style={[styles.imageLabel, { backgroundColor: Colors.accentDim }]}>
                      <Text style={[styles.imageLabelText, { color: Colors.accent }]}>Artwork</Text>
                    </View>
                  </>
                ) : selectedPhoto.generateError === "guest" ? (
                  <View style={[styles.detailImage, styles.generatingBox]}>
                    <Feather name="lock" size={28} color={Colors.accent} />
                    <Text style={[styles.generatingText, { textAlign: "center", paddingHorizontal: 10 }]}>
                      Create an account to generate AI artwork
                    </Text>
                    <Pressable
                      style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.accent, borderRadius: 18 }}
                      onPress={() => { setOverlay("none"); setCameraActive(false); router.push("/(auth)/register"); }}
                    >
                      <Text style={{ color: Colors.bg, fontFamily: "Inter_700Bold", fontSize: 12 }}>Create Account</Text>
                    </Pressable>
                    <Pressable
                      style={{ marginTop: 6 }}
                      onPress={() => { setOverlay("none"); setCameraActive(false); router.push("/(auth)/login"); }}
                    >
                      <Text style={{ color: Colors.accent, fontFamily: "Inter_500Medium", fontSize: 11, textDecorationLine: "underline" }}>Log In</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.detailImage, styles.generatingBox]}>
                    <Feather name="image" size={32} color={Colors.textMuted} />
                    <Text style={styles.generatingText}>No artwork yet</Text>
                  </View>
                )}
              </Pressable>
            </View>
              );
            })()}

            {/* More artworks row */}
            {(selectedPhoto.artworkUris?.length || 0) > 1 && (() => {
              const boxList = [
                selectedPhoto.uri,
                ...selectedPhoto.artworkUris,
              ];
              return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moreArtworksRow}>
                {selectedPhoto.artworkUris.map((uri, idx) => (
                  <View key={idx} style={styles.moreArtworkPair}>
                    <Pressable
                      onPress={() => openEnlarged(selectedPhoto.uri, boxList)}
                    >
                      <Image source={{ uri: selectedPhoto.uri }} style={styles.moreArtworkImg} />
                    </Pressable>
                    <Pressable
                      onPress={() => openEnlarged(uri, boxList)}
                    >
                      <Image source={{ uri }} style={[styles.moreArtworkImg, { borderColor: Colors.accent, borderWidth: 1 }]} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
              );
            })()}

            {/* Prompt chatbox */}
            <View style={styles.promptSection}>
              <Text style={styles.promptTitle}>
                Refine with AI
                {` (${promptTrials} left this month)`}
              </Text>
              <View style={styles.promptRow}>
                <TextInput
                  style={styles.promptInput}
                  placeholder="Add text, change style, adjust mood..."
                  placeholderTextColor={Colors.textMuted}
                  value={customPrompt}
                  onChangeText={setCustomPrompt}
                  multiline
                  numberOfLines={2}
                />
                <Pressable
                  style={[styles.promptSend, (!customPrompt.trim() || promptTrials <= 0 || selectedPhoto.isGenerating) && styles.promptSendDisabled]}
                  onPress={handleGenerateWithPrompt}
                  disabled={!customPrompt.trim() || promptTrials <= 0 || !!selectedPhoto.isGenerating}
                >
                  {selectedPhoto.isGenerating ? (
                    <ActivityIndicator size="small" color={Colors.bg} />
                  ) : (
                    <Feather name="send" size={18} color={Colors.bg} />
                  )}
                </Pressable>
              </View>
              {promptTrials <= 0 && (
                <Pressable onPress={() => !user ? router.push("/(auth)/login") : router.push("/upgrade")}>
                  <Text style={[styles.upgradeHint, { textDecorationLine: "underline" }]}>
                    {!user
                      ? "Log in to unlock prompt refinements"
                      : user.isPremium
                        ? "Monthly prompt limit reached — resets next month"
                        : "Upgrade to Premium for 10 refinements/month"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Back to Camera */}
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 24, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accent + "44", alignSelf: "center" }}
              onPress={closeOverlay}
            >
              <Feather name="camera" size={16} color={Colors.accent} />
              <Text style={{ color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Back to Camera</Text>
            </Pressable>
          </ScrollView>
          {/* Back arrow — last child so it renders on top */}
          <Pressable
            style={[styles.overlayBackBtn, { top: topInset + 12 }]}
            onPress={closeOverlay}
          >
            <Feather name="chevron-left" size={24} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* ENLARGED IMAGE OVERLAY */}
      {overlay === "enlarged" && (enlargedList.length > 0 || enlargedUri) && (() => {
        const displayList = enlargedList.length > 0 ? enlargedList : (enlargedUri ? [enlargedUri] : []);
        const currentUri = displayList[enlargedIndex] || enlargedUri;
        return (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
            <FlatList
              ref={enlargedListRef}
              data={displayList}
              horizontal
              pagingEnabled
              scrollEnabled={enlargedScrollEnabled}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={enlargedIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setEnlargedIndex(newIndex);
                setEnlargedUri(displayList[newIndex] || null);
                setEnlargedScrollEnabled(true);
                if (enlargedPhotoList[newIndex]) {
                  setSelectedPhoto(enlargedPhotoList[newIndex]);
                }
              }}
              renderItem={({ item }) => (
                <ZoomableImage
                  uri={item}
                  width={SCREEN_WIDTH}
                  height={SCREEN_HEIGHT}
                  onZoomChange={(zoomed) => setEnlargedScrollEnabled(!zoomed)}
                />
              )}
              keyExtractor={(_, idx) => `enlarged-${idx}`}
            />

            {/* Page counter */}
            {displayList.length > 1 && (
              <View style={{
                position: "absolute",
                bottom: bottomInset + 20,
                alignSelf: "center",
                backgroundColor: "rgba(0,0,0,0.55)",
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 20,
              }}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", letterSpacing: 0.5 }}>
                  {enlargedIndex + 1} / {displayList.length}
                </Text>
              </View>
            )}

            {/* Action buttons — top-right */}
            <View style={[styles.enlargedRightActions, { top: topInset + 8 }]}>
              <View style={styles.enlargedRightBtns}>
                <Pressable style={styles.enlargedActionBtn} onPress={() => currentUri && handleDownload(currentUri)}>
                  <Feather name="download" size={20} color="#fff" />
                </Pressable>
                <Pressable style={styles.enlargedActionBtn} onPress={() => currentUri && handleShare(currentUri)}>
                  <Feather name="share-2" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  style={[styles.enlargedActionBtn, { backgroundColor: "#2a2a2a" }]}
                  onPress={() => Linking.openURL(`${WEB_BASE}/sell`)}
                >
                  <Feather name="tag" size={20} color={Colors.text} />
                </Pressable>
                <Pressable
                  style={[styles.enlargedActionBtn, { backgroundColor: Colors.accent }]}
                  onPress={() => currentUri && openCart(currentUri)}
                >
                  <Feather name="shopping-cart" size={20} color={Colors.bg} />
                </Pressable>
              </View>
            </View>

            {/* Back arrow — last child so it renders on top */}
            <Pressable style={[styles.overlayBackBtn, { top: topInset + 8 }]} onPress={goBackFromEnlarged}>
              <Feather name="chevron-left" size={24} color="#fff" />
            </Pressable>
          </View>
        );
      })()}

      {/* CART OVERLAY */}
      {overlay === "cart" && (
        <View style={[StyleSheet.absoluteFill, styles.cartOverlay, { paddingTop: topInset, paddingBottom: bottomInset + 16 }]}>
          <Pressable style={[styles.backBtn, { top: topInset + 12 }]} onPress={() => setOverlay("photo-detail")}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
            <Text style={styles.cartTitle}>Order Canvas</Text>

            {cartForArtwork && (
              <Image source={{ uri: cartForArtwork }} style={styles.cartPreview} resizeMode="cover" />
            )}

            <Text style={styles.cartSectionTitle}>Canvas Size</Text>
            <View style={styles.sizesRow}>
              {(Object.keys(CANVAS_SIZES) as SelectedSize[]).map((size) => (
                <Pressable
                  key={size}
                  style={[styles.sizeOption, selectedSize === size && styles.sizeOptionSelected]}
                  onPress={() => setSelectedSize(size)}
                >
                  <Text style={[styles.sizeLabel, selectedSize === size && { color: Colors.accent }]}>
                    {CANVAS_SIZES[size].label}
                  </Text>
                  <Text style={[styles.sizePrice, selectedSize === size && { color: Colors.accent }]}>
                    ${CANVAS_SIZES[size].price}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.cartSectionTitle}>Quantity</Text>
            <View style={styles.quantityRow}>
              <Pressable style={styles.qtyBtn} onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
                <Feather name="minus" size={20} color={Colors.text} />
              </Pressable>
              <Text style={styles.qtyText}>{quantity}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => setQuantity((q) => q + 1)}>
                <Feather name="plus" size={20} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalPrice}>${(CANVAS_SIZES[selectedSize].price * quantity).toFixed(2)}</Text>
            </View>

            <Pressable style={styles.checkoutBtn} onPress={handleAddToCart}>
              <Text style={styles.checkoutBtnText}>Add to Cart</Text>
              <Feather name="shopping-cart" size={18} color={Colors.bg} />
            </Pressable>

            <Text style={styles.checkoutNote}>Sign up required to complete checkout</Text>
          </ScrollView>
        </View>
      )}

      {/* TOAST BANNER */}
      {toast && (
        <View style={[styles.toastBanner, { bottom: bottomInset + 100 }, toast.warn && styles.toastBannerWarn]}>
          <Feather name={toast.warn ? "alert-circle" : "info"} size={16} color={toast.warn ? Colors.accent : Colors.text} />
          <Text style={[styles.toastText, toast.warn && { color: Colors.accent }]}>{toast.message}</Text>
        </View>
      )}

      {/* CREDIT PACK MODAL */}
      <Modal
        visible={creditPackModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreditPackModalVisible(false)}
      >
        <Pressable style={styles.infoModalBackdrop} onPress={() => setCreditPackModalVisible(false)}>
          <Pressable style={[styles.infoModalCard, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
            <View style={styles.infoModalHandle} />
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>Buy More Generates</Text>
              <Pressable onPress={() => setCreditPackModalVisible(false)} hitSlop={12}>
                <Feather name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginBottom: 4 }}>
                You've used all your monthly generates. Credit packs never expire.
              </Text>

              {/* Pack 20 */}
              <Pressable
                style={[styles.sizeOption, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 }]}
                onPress={() => buyCreditsFromMobile("pack20")}
                disabled={buyingCreditPack !== null}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text }}>20 Generates</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>One-time · never expires</Text>
                </View>
                {buyingCreditPack === "pack20" ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <View style={{ backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.bg }}>$4.99</Text>
                  </View>
                )}
              </Pressable>

              {/* Pack 50 */}
              <Pressable
                style={[styles.sizeOption, styles.sizeOptionSelected, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 }]}
                onPress={() => buyCreditsFromMobile("pack50")}
                disabled={buyingCreditPack !== null}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent }}>50 Generates</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.accentMuted }}>Best value · never expires</Text>
                </View>
                {buyingCreditPack === "pack50" ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <View style={{ backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.bg }}>$9.99</Text>
                  </View>
                )}
              </Pressable>

              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
                Secure checkout via Stripe. Credits added instantly after payment.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* INFO MODALS — How It Works & About Us */}
      <Modal
        visible={infoModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoModal(null)}
      >
        <Pressable style={styles.infoModalBackdrop} onPress={() => setInfoModal(null)}>
          <Pressable style={[styles.infoModalCard, { paddingBottom: bottomInset + 16 }]} onPress={() => {}}>
            <View style={styles.infoModalHandle} />
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>
                {infoModal === "howItWorks" ? "How It Works" : "About PAIGENT"}
              </Text>
              <Pressable onPress={() => setInfoModal(null)} hitSlop={12}>
                <Feather name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.infoModalScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14 }}>
              {infoModal === "howItWorks" ? (
                <>
                  {[
                    { n: "01", t: "Open the Camera", d: "Launch PAIGENT and the camera opens automatically. Frame your shot — portraits, landscapes, street scenes, anything you see." },
                    { n: "02", t: "Capture Your Photo", d: "Tap the shutter to take a shot. Flip between front/back camera with the rotate icon, or toggle the flashlight — both flank the shutter button." },
                    { n: "03", t: "AI Generates Your Artwork", d: "Google Gemini analyzes your photo and generates a unique colored sketch artwork in seconds. No filters — true AI creativity." },
                    { n: "04", t: "Preview Side by Side", d: "Your original photo and AI artwork are displayed together. Tap any thumbnail to zoom in, share, or explore the full detail." },
                    { n: "05", t: "Order a Canvas Print", d: "Love it? Order museum-quality canvas prints:\n  • Small  16\"×20\" — $49.99\n  • Medium 18\"×24\" — $59.99\n  • Large  24\"×36\" — $89.99" },
                    { n: "06", t: "Sell Your Photo", d: "Tap the tag icon on any enlarged photo to list it on the PAIGENT marketplace. Set your price and reach thousands of buyers." },
                    { n: "07", t: "Upgrade for More", d: "Free users get 1 AI generate/month. Premium ($3.99/mo) gives 20 generates/month, unlimited photos, prompt variations, and priority processing. Credit packs (20 or 50 generates) are also available for one-time purchase." },
                  ].map((item, i) => (
                    <View key={i} style={styles.infoStep}>
                      <View style={styles.infoStepNum}><Text style={styles.infoStepNumText}>{item.n}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.infoStepTitle}>{item.t}</Text>
                        <Text style={styles.infoStepDesc}>{item.d}</Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <Text style={styles.infoAboutText}>
                    PAIGENT transforms your everyday photos into stunning AI-generated colored sketch artwork using Google's Gemini AI.
                  </Text>
                  <Text style={styles.infoAboutText}>
                    Founded with a passion for making fine art accessible to everyone, PAIGENT lets you create, order, and sell your artwork — all from your phone.
                  </Text>
                  <View style={styles.infoAboutDivider} />
                  {([
                    ["zap", "Powered by Google Gemini AI"],
                    ["image", "Museum-quality canvas prints"],
                    ["shield", "Secure checkout via Stripe"],
                    ["dollar-sign", "Sell photos on the marketplace"],
                    ["smartphone", "Available on iOS"],
                  ] as [string, string][]).map(([icon, label], i) => (
                    <View key={i} style={styles.infoAboutRow}>
                      <Feather name={icon as any} size={15} color={Colors.accent} />
                      <Text style={styles.infoAboutRowText}>{label}</Text>
                    </View>
                  ))}
                  <View style={styles.infoAboutDivider} />
                  <Text style={[styles.infoAboutText, { fontStyle: "italic", color: Colors.textSecondary }]}>
                    "Your moments, as art."
                  </Text>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent, letterSpacing: 2 },
  logoDot: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text, letterSpacing: 2 },
  cartTopBtn: { padding: 8, position: "relative" },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.bg },
  mainArea: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  photoStrip: {
    width: TINY_SIZE + 20,
    paddingRight: 10,
    alignItems: "center",
    gap: 8,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  profileBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  tinyContainer: {
    width: TINY_SIZE,
    height: TINY_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  tinyImg: { width: "100%", height: "100%" },
  tinyGenerating: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  tinyCheckmark: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: Colors.accent,
    borderRadius: 6,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCount: {
    backgroundColor: Colors.bgCard,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  photoCountText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  captureArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 10,
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  timerToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timerToggleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9000,
  },
  countdownNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 120,
    color: Colors.text,
    lineHeight: 130,
  },
  countdownCancel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 2,
    marginTop: 12,
  },
  cameraCtrlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.text,
  },

  // Permission
  permTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, marginTop: 16, textAlign: "center" },
  permText: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 32 },
  permBtn: { backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30, marginTop: 8 },
  permBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.bg },

  // Linktree
  linktreeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glass,
    zIndex: 20,
  },
  overlayCloseBtn: {
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
    zIndex: 30,
  },
  linktreeContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  linktreeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  linktreeBrand: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text, letterSpacing: 1 },
  linktreeTagline: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  linktreeLinks: { width: "100%", gap: 12 },
  linktreePrimaryLink: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
  },
  linktreePrimaryLinkText: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.bg, letterSpacing: 2 },
  linktreeSecondaryLink: {
    borderWidth: 2,
    borderColor: Colors.text,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  linktreeSecondaryLinkText: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, letterSpacing: 2 },
  linktreeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  linktreeLinkText: { fontFamily: "Inter_500Medium", fontSize: 16, color: Colors.textSecondary },
  userInfoBox: { alignItems: "center", gap: 6, padding: 20, backgroundColor: Colors.bgCard, borderRadius: 16, width: "100%" },
  userInfoName: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  userInfoEmail: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  premiumBadge: { backgroundColor: Colors.accentDim, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  premiumBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.accent, letterSpacing: 1 },
  socialRow: { flexDirection: "row", gap: 20, marginTop: 8 },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  socialLabel: { fontSize: 20, color: Colors.textSecondary },

  // Photo Detail
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg,
    zIndex: 20,
  },
  detailScroll: { flex: 1 },
  backBtn: {
    position: "absolute",
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 30,
    padding: 8,
  },
  backBtnText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  imageRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  imageBox: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  detailImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
  },
  generatingBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generatingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  imageLabel: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  imageLabelText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  moreArtworksRow: { marginBottom: 16 },
  moreArtworkPair: { flexDirection: "row", gap: 6, marginRight: 12 },
  moreArtworkImg: { width: 80, height: 80, borderRadius: 10, backgroundColor: Colors.bgCard },
  promptSection: { marginBottom: 16 },
  promptTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary, marginBottom: 10 },
  promptRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  promptInput: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: "top",
  },
  promptSend: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  promptSendDisabled: { backgroundColor: Colors.textMuted },
  upgradeHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.accentMuted, marginTop: 8, textAlign: "center" },

  // Enlarged
  overlayBackBtn: {
    position: "absolute",
    left: 16,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  enlargedRightActions: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  enlargedActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  enlargedRightBtns: { flexDirection: "row", gap: 10 },

  // Cart
  cartOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg,
    zIndex: 20,
  },
  cartTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text, marginBottom: 16 },
  cartPreview: { width: "100%", height: 200, borderRadius: 16, marginBottom: 20, backgroundColor: Colors.bgCard },
  cartSectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  sizesRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  sizeOption: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 4,
  },
  sizeOptionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentDim },
  sizeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  sizePrice: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginBottom: 24,
    backgroundColor: Colors.bgCard,
    padding: 4,
    borderRadius: 14,
    alignSelf: "flex-start",
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, minWidth: 40, textAlign: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  totalLabel: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.textSecondary },
  totalPrice: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.accent },
  checkoutBtn: {
    flexDirection: "row",
    backgroundColor: Colors.accent,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
  },
  checkoutBtnText: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.bg },
  checkoutNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  // Toast
  toastBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.bgElevated,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastBannerWarn: {
    borderColor: Colors.accent + "66",
    backgroundColor: Colors.accentDim,
  },
  toastText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    lineHeight: 18,
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  infoModalCard: {
    backgroundColor: "#141414",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#2a2a2a",
    maxHeight: "65%",
  },
  infoModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  infoModalTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  infoModalScroll: {
    flex: 1,
  },
  infoStep: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  infoStepNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.accent + "22",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  infoStepNumText: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  infoStepTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginBottom: 3,
  },
  infoStepDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  infoAboutText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  infoAboutDivider: {
    height: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 4,
  },
  infoAboutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoAboutRowText: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
