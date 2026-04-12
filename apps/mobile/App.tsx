import "react-native-get-random-values";
import "./global.css";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform, PermissionsAndroid, Alert, View, Text, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { HomeScreen } from "./src/screens/HomeScreen";
import { NavigationScreen } from "./src/screens/NavigationScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { bleService } from "./src/services/bleService";
import { getCurrentSession } from "./src/services/authService";
import { useAuthStore } from "./src/store/useAuthStore";
import { useSettingsStore } from "./src/store/useSettingsStore";

const Tabs = createBottomTabNavigator();

const lightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#f3f4f6",
    card: "#ffffff",
    text: "#111827",
    border: "#e5e7eb",
    primary: "#fc4c02"
  }
};

const darkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0b1220",
    card: "#111827",
    text: "#f9fafb",
    border: "#1f2937",
    primary: "#fc4c02"
  }
};

async function checkLocationServiceEnabled(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    return await Location.hasServicesEnabledAsync();
  } catch (err) {
    console.warn("Location service check error:", err);
    return true;
  }
}

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location Permission",
        message: "NavDot needs access to your location for navigation and route planning.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "Allow"
      }
    );

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      const servicesEnabled = await checkLocationServiceEnabled();
      if (!servicesEnabled) {
        Alert.alert(
          "Turn On Location",
          "Location services are off on this device. Turn on GPS to continue using navigation features.",
          [{ text: "OK" }]
        );
        return false;
      }
    }
    
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("Location permission error:", err);
    return false;
  }
}

async function requestBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const result = await bleService.requestPermissions();
    if (!result) {
      Alert.alert(
        "Permissions Required",
        "Bluetooth and Location permissions are needed for device pairing and navigation features."
      );
    }
    return result;
  } catch (err) {
    console.warn(err);
    return false;
  }
}

async function checkBluetoothEnabled(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    const poweredOn = await bleService.isPoweredOn();
    if (!poweredOn) {
      Alert.alert(
        "Turn On Bluetooth",
        "Bluetooth is off on this device. Turn it on to pair with NavDot hardware.",
        [{ text: "OK" }]
      );
    }
    return poweredOn;
  } catch (err) {
    console.warn("Bluetooth state check error:", err);
    return true;
  }
}

export default function App() {
  const token = useAuthStore((state) => state.token);
  const isReady = useAuthStore((state) => state.isReady);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setReady = useAuthStore((state) => state.setReady);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const isDark = themeMode === "dark";
  const navTheme = isDark ? darkNavTheme : lightNavTheme;
  const [permissionsRequested, setPermissionsRequested] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Request location permission (includes reminder to enable service)
        const locationGranted = await requestLocationPermission();
        
        // Then request Bluetooth permission
        const bluetoothGranted = await requestBluetoothPermission();

        // Only warn if Bluetooth radio is actually off
        const bluetoothEnabled = await checkBluetoothEnabled();
        
        // Attempt to auto-connect to preferred device
        await bleService.autoConnectPreferredDevice();
        
        if (!locationGranted || !bluetoothGranted || !bluetoothEnabled) {
          Alert.alert(
            "Permissions Incomplete",
            "Some features may not work without Bluetooth and Location permissions enabled."
          );
        }
      } catch (err) {
        console.error("Permission request error:", err);
      } finally {
        setPermissionsRequested(true);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    const bootstrapAuth = async () => {
      // Wait for permissions to be requested first
      if (!permissionsRequested) {
        return;
      }

      try {
        const currentSession = await getCurrentSession();
        if (currentSession) {
          setSession(currentSession);
        } else {
          clearSession();
        }
      } finally {
        setReady(true);
      }
    };

    void bootstrapAuth();
  }, [permissionsRequested, clearSession, setReady, setSession]);

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NavigationContainer theme={navTheme}>
        {!isReady ? null : !token ? (
          <AuthScreen />
        ) : (
          <Tabs.Navigator
            initialRouteName="Pairing"
            screenOptions={({ route }) => ({
              headerStyle: {
                backgroundColor: isDark ? "#0b1220" : "#f3f4f6"
              },
              headerShadowVisible: false,
              headerTintColor: isDark ? "#f9fafb" : "#111827",
              headerTitleStyle: {
                fontFamily: "System",
                fontWeight: "700",
                letterSpacing: 0.2,
                fontSize: 21
              },
              tabBarStyle: {
                position: "absolute",
                left: 6,
                right: 6,
                bottom: 8,
                borderRadius: 10,
                backgroundColor: isDark ? "#111827" : "#ffffff",
                borderTopColor: isDark ? "#1f2937" : "#e5e7eb",
                borderWidth: 4,
                height: 60,
                paddingTop: 2,
                paddingBottom: 5
              },
              tabBarLabelStyle: {
                fontWeight: "700",
                letterSpacing: 0,
                fontSize: 11
              },
              tabBarHideOnKeyboard: true,
              tabBarActiveTintColor: "#fc4c02",
              tabBarInactiveTintColor: isDark ? "#6b7280" : "#9ca3af",
              tabBarIcon: ({ color, size, focused }) => {
                const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
                  Pairing: "home",
                  Navigation: "compass",
                  Activities: "activity",
                  Profile: "user"
                };

                const icon = iconMap[route.name] ?? "circle";
                return <Feather name={icon} size={focused ? size + 2 : size} color={color} />;
              }
            })}
          >
            <Tabs.Screen
              name="Pairing"
              component={HomeScreen}
              options={{
                headerShown: false,
                tabBarLabel: "Home"
              }}
            />
            <Tabs.Screen name="Navigation" component={NavigationScreen} options={{ headerShown: false }} />
            <Tabs.Screen name="Activities" component={ActivityScreen} options={{ headerShown: false }} />
            <Tabs.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false, tabBarLabel: "Profile" }} />
          </Tabs.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
