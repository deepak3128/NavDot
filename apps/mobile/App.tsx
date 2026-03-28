import "react-native-get-random-values";
import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { NavigationScreen } from "./src/screens/NavigationScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { bleService } from "./src/services/bleService";
import { useAuthStore } from "./src/store/useAuthStore";

const Tabs = createBottomTabNavigator();

const navTheme = {
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

export default function App() {
  const token = useAuthStore((state) => state.token);
  const isReady = useAuthStore((state) => state.isReady);

  useEffect(() => {
    const bootstrap = async () => {
      await bleService.requestPermissions();
      await bleService.autoConnectPreferredDevice();
    };

    void bootstrap();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        {!isReady ? null : !token ? (
          <AuthScreen />
        ) : (
          <Tabs.Navigator
            initialRouteName="Pairing"
            screenOptions={({ route }) => ({
              headerStyle: {
                backgroundColor: "#f3f4f6"
              },
              headerShadowVisible: false,
              headerTintColor: "#111827",
              headerTitleStyle: {
                fontFamily: "System",
                fontWeight: "700",
                letterSpacing: 0.2,
                fontSize: 21
              },
              tabBarStyle: {
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 7,
                borderRadius: 18,
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                height: 66,
                paddingTop: 5,
                paddingBottom: 8,
                elevation: 6,
                shadowColor: "#111827",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 10
              },
              tabBarLabelStyle: {
                fontWeight: "700",
                letterSpacing: 0,
                fontSize: 11
              },
              tabBarHideOnKeyboard: true,
              tabBarActiveTintColor: "#fc4c02",
              tabBarInactiveTintColor: "#9ca3af",
              tabBarIcon: ({ color, size, focused }) => {
                const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
                  Pairing: "home",
                  Navigation: "compass",
                  Activities: "activity",
                  Settings: "sliders"
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
                title: "Home",
                tabBarLabel: "Home"
              }}
            />
            <Tabs.Screen name="Navigation" component={NavigationScreen} options={{ headerShown: false }} />
            <Tabs.Screen name="Activities" component={ActivityScreen} options={{ headerShown: false }} />
            <Tabs.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
          </Tabs.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
