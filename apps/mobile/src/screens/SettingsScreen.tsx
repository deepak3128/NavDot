import { Pressable, ScrollView, Text, View } from "react-native";
import { DevicePreview } from "../components/DevicePreview";
import { useSettingsStore } from "../store/useSettingsStore";
import { useNavStore } from "../store/useNavStore";
import { useAuthStore } from "../store/useAuthStore";

function clampZoom(value: number): number {
  return Math.max(11, Math.min(19, value));
}

function clampHour(value: number): number {
  return Math.max(0, Math.min(23, value));
}

export function SettingsScreen() {
  const settings = useSettingsStore();
  const setZoomLevel = useNavStore((state) => state.setZoomLevel);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

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
    <ScrollView className="flex-1 bg-[#f3f4f6] px-5 pt-6 pb-8" contentContainerStyle={{ paddingBottom: 92 }}>
      <View className="absolute -left-12 -top-8 h-40 w-40 rounded-full bg-[#ffbfa5] opacity-70" />
      <View className="absolute -right-10 top-28 h-36 w-36 rounded-full bg-[#bcd5ff] opacity-70" />

      <Text className="text-3xl font-black tracking-tight text-[#111827]">Settings</Text>
      <Text className="mt-1 text-sm leading-6 text-[#4b5563]">
        Tune map behavior, dim policy, and units.
      </Text>

      <View className="mt-5 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-sm font-bold text-[#111827]">Default Map Zoom: {settings.defaultZoom}</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => adjustZoom(-1)}>
            <Text className="text-center text-[#111827]">-</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => adjustZoom(1)}>
            <Text className="text-center text-[#111827]">+</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-sm font-bold text-[#111827]">Auto-Dim Timeout: {settings.autoDimTimeoutSec}s</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => adjustDim(-5)}>
            <Text className="text-center text-[#111827]">-5s</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => adjustDim(5)}>
            <Text className="text-center text-[#111827]">+5s</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-sm font-bold text-[#111827]">
          Display Schedule: {settings.schedule.startHour}:00 - {settings.schedule.endHour}:00
        </Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => setStart(-1)}>
            <Text className="text-center text-[#111827]">Start -1h</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => setStart(1)}>
            <Text className="text-center text-[#111827]">Start +1h</Text>
          </Pressable>
        </View>
        <View className="mt-2 flex-row gap-2">
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => setEnd(-1)}>
            <Text className="text-center text-[#111827]">End -1h</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-xl border border-[#d1d5db] py-2" onPress={() => setEnd(1)}>
            <Text className="text-center text-[#111827]">End +1h</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-sm font-bold text-[#111827]">Units</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable
            className={`flex-1 rounded-xl py-2 ${settings.units === "kmh" ? "bg-[#fc4c02]" : "border border-[#d1d5db]"}`}
            onPress={() => settings.setUnits("kmh")}
          >
            <Text className={`text-center font-semibold ${settings.units === "kmh" ? "text-white" : "text-[#111827]"}`}>
              km/h
            </Text>
          </Pressable>
          <Pressable
            className={`flex-1 rounded-xl py-2 ${settings.units === "mph" ? "bg-[#fc4c02]" : "border border-[#d1d5db]"}`}
            onPress={() => settings.setUnits("mph")}
          >
            <Text className={`text-center font-semibold ${settings.units === "mph" ? "text-white" : "text-[#111827]"}`}>
              mph
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-sm font-bold text-[#111827]">Account</Text>
        <Text className="mt-1 text-xs text-[#6b7280]">Signed in as {user?.email ?? "unknown"}</Text>
        <Pressable className="mt-3 rounded-xl bg-[#111827] px-3 py-3" onPress={clearSession}>
          <Text className="text-center font-bold text-white">Logout</Text>
        </Pressable>
      </View>

      <View className="mt-5">
        <DevicePreview />
      </View>
    </ScrollView>
  );
}
