import "react-native-get-random-values";
import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { NavigationScreen } from "./src/screens/NavigationScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { bleService } from "./src/services/bleService";
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

export default function App() {
  const token = useAuthStore((state) => state.token);
  const isReady = useAuthStore((state) => state.isReady);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const isDark = themeMode === "dark";
  const navTheme = isDark ? darkNavTheme : lightNavTheme;

  useEffect(() => {
    const bootstrap = async () => {
      await bleService.requestPermissions();
      await bleService.autoConnectPreferredDevice();
    };

    void bootstrap();
  }, []);

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
