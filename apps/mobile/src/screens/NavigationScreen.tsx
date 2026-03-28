import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
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
  const navigation = useNavigation();
  const isConnected = useBleStore((state) => state.isConnected);
  const [isRideActive, setIsRideActive] = useState(false);
  const [rideBusy, setRideBusy] = useState(false);

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
        useNavStore.getState().setStatusMessage("Ready to ride. Tap Start Ride.");
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
      setIsRideActive(false);
      stopLocationAndHeadingStreams();
    };
  }, []);

  const startRide = async () => {
    if (rideBusy || isRideActive) {
      return;
    }

    setRideBusy(true);

    try {
      const granted = await requestLocationPermissions();
      if (!granted) {
        useNavStore.getState().setStatusMessage("Location permission denied. Enable location to start ride.");
        return;
      }

      await startLocationAndHeadingStreams();
      await startNavigationStreaming();
      setIsRideActive(true);
      useNavStore.getState().startRideMode();
      useNavStore.getState().setStatusMessage("Ride started. Streaming data to NavDot.");
      navigation.navigate("Pairing" as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start ride.";
      useNavStore.getState().setStatusMessage(`Start ride failed: ${message}`);
      setIsRideActive(false);
    } finally {
      setRideBusy(false);
    }
  };

  const endRide = async () => {
    if (rideBusy || !isRideActive) {
      return;
    }

    setRideBusy(true);
    try {
      await stopNavigationStreaming();
      setIsRideActive(false);
      useNavStore.getState().stopRideMode();
      useNavStore.getState().setStatusMessage("Ride ended.");
    } finally {
      setRideBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#f3f4f6] px-5 pt-10" contentContainerStyle={{ paddingBottom: 92 }}>
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

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Ride Control</Text>
        <View className="mt-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-[#111827]">Session</Text>
            <Text className={`mt-1 text-xs font-bold ${isRideActive ? "text-[#15803d]" : "text-[#6b7280]"}`}>
              {isRideActive ? "ACTIVE" : "IDLE"}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              className={`rounded-xl px-4 py-2.5 ${isRideActive || rideBusy ? "bg-[#d1d5db]" : "bg-[#fc4c02]"}`}
              onPress={() => void startRide()}
              disabled={isRideActive || rideBusy}
            >
              <Text className={`font-bold ${isRideActive || rideBusy ? "text-[#6b7280]" : "text-white"}`}>
                {rideBusy && !isRideActive ? "Starting..." : "Start Ride"}
              </Text>
            </Pressable>
            <Pressable
              className={`rounded-xl border px-4 py-2.5 ${isRideActive && !rideBusy ? "border-[#111827] bg-white" : "border-[#d1d5db] bg-[#f9fafb]"}`}
              onPress={() => void endRide()}
              disabled={!isRideActive || rideBusy}
            >
              <Text className={`font-bold ${isRideActive && !rideBusy ? "text-[#111827]" : "text-[#9ca3af]"}`}>
                {rideBusy && isRideActive ? "Ending..." : "End Ride"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="mt-4 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Active Destination</Text>
        <Text className="mt-2 text-sm font-semibold text-[#111827]">
          {nav.destination
            ? `${nav.destination.latitude.toFixed(6)}, ${nav.destination.longitude.toFixed(6)}`
            : "No destination selected yet"}
        </Text>
        <Text className="mt-1 text-xs text-[#6b7280]">
          {nav.destination
            ? "Navigation stream includes destination context for IoT sync."
            : "Set a destination in Pairing tab to send route target with stream."}
        </Text>
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

      <View className="mt-5 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
        <Text className="text-xs text-[#6b7280]">
          ESP32 preview updates from live GPS/heading streams. If values stay 0, check location permission and sensor access.
        </Text>
      </View>

    </ScrollView>
  );
}
