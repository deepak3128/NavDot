import { Pressable, ScrollView, Text, View } from "react-native";
import { useSettingsStore } from "../store/useSettingsStore";
import { useNavStore } from "../store/useNavStore";
import { useAuthStore } from "../store/useAuthStore";

function clampZoom(value: number): number {
  return Math.max(11, Math.min(19, value));
}

function clampHour(value: number): number {
  return Math.max(0, Math.min(23, value));
}

function formatHour(value: number): string {
  return `${String(value).padStart(2, "0")}:00`;
}

export default function ProfileScreen() {
  const settings = useSettingsStore();
  const setZoomLevel = useNavStore((state) => state.setZoomLevel);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isDark = settings.themeMode === "dark";
  const toggleTheme = () => {
    settings.setThemeMode(isDark ? "light" : "dark");
  };
  const initials = (user?.fullName ?? user?.email ?? "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const adjustZoom = (delta: number) => {
    const next = clampZoom(settings.defaultZoom + delta);
    settings.setDefaultZoom(next);
    setZoomLevel(next);
  };

  const adjustDim = (delta: number) => {
    settings.setAutoDimTimeoutSec(Math.max(5, settings.autoDimTimeoutSec + delta));
  };

  const setStart = (delta: number) => {
    settings.setSchedule({
      ...settings.schedule,
      startHour: clampHour(settings.schedule.startHour + delta)
    });
  };

  const setEnd = (delta: number) => {
    settings.setSchedule({
      ...settings.schedule,
      endHour: clampHour(settings.schedule.endHour + delta)
    });
  };

  return (
    <ScrollView
      className={`flex-1 px-5 pt-8 pb-8 ${isDark ? "bg-[#0b1220]" : "bg-[#f3f4f6]"}`}
      contentContainerStyle={{ paddingBottom: 96 }}
    >
      <View className={`absolute -left-12 -top-8 h-40 w-40 rounded-full ${isDark ? "bg-[#1f2937]" : "bg-[#ffbfa5]"} opacity-70`} />
      <View className={`absolute -right-10 top-28 h-36 w-36 rounded-full ${isDark ? "bg-[#1e3a8a]" : "bg-[#bcd5ff]"} opacity-70`} />

      <Text className={`text-3xl font-black tracking-tight ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>Profile</Text>
      <Text className={`mt-1 text-sm leading-6 ${isDark ? "text-[#9ca3af]" : "text-[#4b5563]"}`}>
        Manage your account, ride preferences, and security.
      </Text>

      <View className={`relative mt-5 rounded-3xl border p-5 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <Pressable
          className={`absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-full border ${
            isDark ? "border-[#374151] bg-[#0b1220]" : "border-[#e5e7eb] bg-[#f8fafc]"
          }`}
          onPress={toggleTheme}
          accessibilityRole="button"
          accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
          hitSlop={12}
          style={{ zIndex: 50, elevation: 50 }}
        >
          <Text className={`text-base ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>{isDark ? "☀" : "☾"}</Text>
        </Pressable>

        <View className="flex-row items-center gap-4">
          <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? "bg-[#0b1220]" : "bg-[#111827]"}`}>
            <Text className="text-xl font-black text-white">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className={`text-lg font-black ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>{user?.fullName ?? "NavDot Rider"}</Text>
            <Text className={`mt-0.5 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>{user?.email ?? "No email found"}</Text>
            <Text className="mt-1 text-[11px] uppercase tracking-wide text-[#9ca3af]">ID: {user?.id ?? "guest"}</Text>
          </View>
        </View>

        <View className="mt-4 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#d1d5db] bg-[#f9fafb]"}`} onPress={() => {}}>
            <Text className={`text-center text-xs font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Edit Profile</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#d1d5db] bg-[#f9fafb]"}`} onPress={() => {}}>
            <Text className={`text-center text-xs font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Manage Devices</Text>
          </Pressable>
        </View>
      </View>

      <View className={`mt-4 rounded-3xl border p-5 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <Text className={`text-sm font-bold ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>Ride Preferences</Text>

        <Text className={`mt-4 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Speed Unit</Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable
            className={`flex-1 rounded-xl py-2 ${settings.units === "kmh" ? "bg-[#fc4c02]" : isDark ? "border border-[#374151]" : "border border-[#d1d5db]"}`}
            onPress={() => settings.setUnits("kmh")}
          >
            <Text className={`text-center font-semibold ${settings.units === "kmh" ? "text-white" : isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>km/h</Text>
          </Pressable>
          <Pressable
            className={`flex-1 rounded-xl py-2 ${settings.units === "mph" ? "bg-[#fc4c02]" : isDark ? "border border-[#374151]" : "border border-[#d1d5db]"}`}
            onPress={() => settings.setUnits("mph")}
          >
            <Text className={`text-center font-semibold ${settings.units === "mph" ? "text-white" : isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>mph</Text>
          </Pressable>
        </View>

        <Text className={`mt-4 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Default Map Zoom: {settings.defaultZoom}</Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => adjustZoom(-1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>-</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => adjustZoom(1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>+</Text>
          </Pressable>
        </View>

        <Text className={`mt-4 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Auto-Dim Timeout: {settings.autoDimTimeoutSec}s</Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => adjustDim(-5)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>-5s</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => adjustDim(5)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>+5s</Text>
          </Pressable>
        </View>

        <Text className={`mt-4 text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>
          Display Schedule: {formatHour(settings.schedule.startHour)} - {formatHour(settings.schedule.endHour)}
        </Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => setStart(-1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Start -1h</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => setStart(1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Start +1h</Text>
          </Pressable>
        </View>
        <View className="mt-2 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => setEnd(-1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>End -1h</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => setEnd(1)}>
            <Text className={`text-center ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>End +1h</Text>
          </Pressable>
        </View>
      </View>

      <View className={`mt-4 rounded-3xl border p-5 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <Text className={`text-sm font-bold ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>Privacy & Security</Text>
        <View className={`mt-3 rounded-xl px-3 py-2.5 ${isDark ? "bg-[#0f172a]" : "bg-[#f9fafb]"}`}>
          <Text className={`text-xs ${isDark ? "text-[#9ca3af]" : "text-[#4b5563]"}`}>Signed in as {user?.email ?? "unknown"}</Text>
        </View>
        <View className="mt-3 flex-row gap-2">
          <Pressable className={`flex-1 rounded-xl border py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#d1d5db] bg-[#f9fafb]"}`} onPress={() => {}}>
            <Text className={`text-center text-xs font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Change Password</Text>
          </Pressable>
          <Pressable className={`flex-1 rounded-xl border py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#d1d5db] bg-[#f9fafb]"}`} onPress={() => {}}>
            <Text className={`text-center text-xs font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Privacy Settings</Text>
          </Pressable>
        </View>
        <Pressable className="mt-3 rounded-xl bg-[#111827] px-3 py-3" onPress={clearSession}>
          <Text className="text-center font-bold text-white">Sign Out</Text>
        </Pressable>
      </View>

      <View className={`mt-4 rounded-3xl border p-5 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <Text className={`text-sm font-bold ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>Help & Support</Text>
        <Pressable className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => {}}>
          <Text className={`text-sm font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>FAQ</Text>
          <Text className={`mt-0.5 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Find quick answers for app usage.</Text>
        </Pressable>
        <Pressable className={`mt-2 rounded-xl border px-3 py-3 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`} onPress={() => {}}>
          <Text className={`text-sm font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Contact Support</Text>
          <Text className={`mt-0.5 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Report issues and get assistance.</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
