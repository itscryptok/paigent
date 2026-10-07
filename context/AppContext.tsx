import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useState,
  useMemo,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

export interface CapturedPhoto {
  id: string;
  uri: string;
  imageBase64?: string;
  artworkUri: string | null;
  artworkUris: string[];
  isGenerating: boolean;
  generateError?: string | null;
  sessionId: string | null;
  timestamp: number;
}

export interface CartItem {
  artworkUri: string;
  canvasSize: "small" | "medium" | "large";
  quantity: number;
}

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

export interface User {
  id: number;
  email: string;
  name: string;
  isPremium: boolean;
  premiumPlan?: "monthly" | "yearly" | null;
  premiumExpiresAt?: string | null;
}

interface AppContextValue {
  user: User | null;
  token: string | null;
  photos: CapturedPhoto[];
  cartItems: CartItem[];
  addPhoto: (photo: CapturedPhoto) => void;
  updatePhoto: (id: string, updates: Partial<CapturedPhoto>) => void;
  removePhoto: (id: string) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoadingAuth: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const MAX_FREE_PHOTOS = 4;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("token");
        const storedUser = await AsyncStorage.getItem("user");
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          setAuthTokenGetter(() => storedToken);
        }
      } catch {}
      setIsLoadingAuth(false);
    };
    load();
  }, []);

  const login = useCallback(async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
    await AsyncStorage.setItem("token", newToken);
    await AsyncStorage.setItem("user", JSON.stringify(newUser));
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setAuthTokenGetter(() => null);
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("user");
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = await AsyncStorage.getItem("token");
    if (!storedToken) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (!res.ok) return;
      const freshUser: User = await res.json();
      setUser(freshUser);
      await AsyncStorage.setItem("user", JSON.stringify(freshUser));
    } catch {}
  }, []);

  const addPhoto = useCallback((photo: CapturedPhoto) => {
    setPhotos((prev) => {
      const maxPhotos = MAX_FREE_PHOTOS;
      if (prev.length >= maxPhotos) return prev;
      return [photo, ...prev];
    });
  }, []);

  const updatePhoto = useCallback((id: string, updates: Partial<CapturedPhoto>) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addToCart = useCallback((item: CartItem) => {
    setCartItems((prev) => [...prev, item]);
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

  const value = useMemo(
    () => ({
      user,
      token,
      photos,
      cartItems,
      addPhoto,
      updatePhoto,
      removePhoto,
      addToCart,
      removeFromCart,
      clearCart,
      login,
      logout,
      refreshUser,
      isLoadingAuth,
    }),
    [user, token, photos, cartItems, addPhoto, updatePhoto, removePhoto, addToCart, removeFromCart, clearCart, login, logout, refreshUser, isLoadingAuth]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
