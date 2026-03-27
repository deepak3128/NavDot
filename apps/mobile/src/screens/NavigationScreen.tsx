import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DevicePreview } from "../components/DevicePreview";
import {
  startNavigationStreaming,
  stopNavigationStreaming,
  tickTileRefresh
} from "../services/navigationService";
import {
  requestLocationPermissions,
  startLocationAndHeadingStreams,
  stopLocationAndHeadingStreams
} from "../services/locationService";
import { useNavStore } from "../store/useNavStore";
import { useBleStore } from "../store/useBleStore";

export function NavigationScreen() {
  const nav = useNavStore();
  const isConnected = useBleStore((state) => state.isConnected);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const granted = await requestLocationPermissions();
      if (!granted) {
        useNavStore.getState().setStatusMessage("Location permission denied.");
        return;
      }

      await startLocationAndHeadingStreams();
      if (mounted) {
        await startNavigationStreaming();
      }
    };

    void bootstrap();

    const tileTimer = setInterval(() => {
      void tickTileRefresh();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(tileTimer);
      void stopNavigationStreaming();
      stopLocationAndHeadingStreams();
    };
  }, []);

  return (
    <ScrollView className="flex-1 bg-[#f3f4f6] px-5 pt-6" contentContainerStyle={{ paddingBottom: 92 }}>
      <View className="absolute -left-10 top-16 h-36 w-36 rounded-full bg-[#ffbfa5] opacity-68" />
      <View className="absolute -right-10 -top-6 h-36 w-36 rounded-full bg-[#bcd5ff] opacity-68" />

      <Text className="text-3xl font-black tracking-tight text-[#111827]">Navigation</Text>
      <Text className="mt-1 max-w-[330px] text-sm leading-6 text-[#4b5563]">
        Stream heading at 10Hz and keep your map context synced with adaptive tile refresh.
      </Text>

      <View className="mt-5 flex-row flex-wrap gap-3">
        <View className="min-w-[30%] flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
          <Text className="text-[11px] uppercase tracking-wide text-[#6b7280]">BLE</Text>
          <Text className={`mt-1 text-base font-bold ${isConnected ? "text-[#059669]" : "text-[#dc2626]"}`}>
            {isConnected ? "Connected" : "Disconnected"}
          </Text>
        </View>
        <View className="min-w-[30%] flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
          <Text className="text-[11px] uppercase tracking-wide text-[#6b7280]">GPS</Text>
          <Text className={`mt-1 text-base font-bold ${nav.hasGpsFix ? "text-[#0284c7]" : "text-[#d97706]"}`}>
            {nav.hasGpsFix ? "Acquired" : "Waiting"}
          </Text>
        </View>
        <View className="min-w-[30%] flex-1 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
          <Text className="text-[11px] uppercase tracking-wide text-[#6b7280]">Network</Text>
          <Text className={`mt-1 text-base font-bold ${nav.isOnline ? "text-[#059669]" : "text-[#dc2626]"}`}>
            {nav.isOnline ? "Online" : "Offline"}
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Current Position</Text>
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1 rounded-xl bg-[#f9fafb] px-3 py-3">
            <Text className="text-[11px] uppercase text-[#6b7280]">Latitude</Text>
            <Text className="mt-1 text-lg font-bold text-[#111827]">{nav.latitude?.toFixed(6) ?? "-"}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-[#f9fafb] px-3 py-3">
            <Text className="text-[11px] uppercase text-[#6b7280]">Longitude</Text>
            <Text className="mt-1 text-lg font-bold text-[#111827]">{nav.longitude?.toFixed(6) ?? "-"}</Text>
          </View>
        </View>
      </View>

      <View className="mt-4">
        <DevicePreview />
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Tile Encoder</Text>
        <Text className="mt-2 text-sm text-[#374151]" numberOfLines={3}>
          {nav.encodedTileSummary ?? "No encoded tiles yet."}
        </Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Pressable className="flex-1 rounded-2xl bg-[#fc4c02] px-4 py-4" onPress={() => void startNavigationStreaming()}>
          <Text className="text-center font-black tracking-wide text-white">Resume Stream</Text>
        </Pressable>
        <Pressable
          className="flex-1 rounded-2xl border border-[#d1d5db] bg-white px-4 py-4"
          onPress={() => void stopNavigationStreaming()}
        >
          <Text className="text-center font-bold text-[#111827]">Pause Stream</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
