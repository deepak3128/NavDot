import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { loadRideActivitySnapshot } from "../services/activityService";
import { useActivityStore } from "../store/useActivityStore";
import { useSettingsStore } from "../store/useSettingsStore";

type Segment = "rides" | "device";

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return "-";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatPace(distanceMeters: number, movingSeconds: number): string {
  if (distanceMeters <= 0 || movingSeconds <= 0) {
    return "-";
  }

  const minutesPerKm = movingSeconds / 60 / (distanceMeters / 1000);
  const min = Math.floor(minutesPerKm);
  const sec = Math.round((minutesPerKm - min) * 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}/km`;
}

function formatSyncLabel(iso?: string): string {
  if (!iso) {
    return "No snapshots yet";
  }

  return `Last refresh ${new Date(iso).toLocaleString()}`;
}

export function ActivityScreen() {
  const [segment, setSegment] = useState<Segment>("rides");
  const isDark = useSettingsStore((state) => state.themeMode === "dark");

  const { deviceName, firmwareVersion, sessions, syncStatuses, isLoading, error, setError, setLoading, setImportData } =
    useActivityStore();
  const lastSyncedAt = useActivityStore((state) => state.lastSyncedAt);

  useEffect(() => {
    if (!error) {
      return;
    }

    if (/token|activity|access/i.test(error)) {
      setError(undefined);
    }
  }, [error, setError]);

  const title = useMemo(() => deviceName ?? "NavDot Device Activity", [deviceName]);

  const runSync = async () => {
    setLoading(true);
    setError(undefined);

    try {
      const payload = await loadRideActivitySnapshot();
      setImportData(payload);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Failed to load ride activity snapshot.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className={`flex-1 px-5 pt-10 pb-8 ${isDark ? "bg-[#0b1220]" : "bg-[#f3f4f6]"}`}
      contentContainerStyle={{ paddingBottom: 92 }}
    >
      <View className={`absolute -left-10 -top-6 h-36 w-36 rounded-full ${isDark ? "bg-[#1f2937]" : "bg-[#ffbfa5]"} opacity-68`} />
      <View className={`absolute -right-10 top-28 h-36 w-36 rounded-full ${isDark ? "bg-[#1e3a8a]" : "bg-[#bcd5ff]"} opacity-68`} />

      <Text className={`text-3xl font-black tracking-tight ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>Activity</Text>
      <Text className={`mt-1 text-sm leading-6 ${isDark ? "text-[#9ca3af]" : "text-[#4b5563]"}`}>
        Track bike navigation rides and instruction delivery health for your connected IoT device.
      </Text>

      <View className={`mt-5 overflow-hidden rounded-3xl border p-5 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <View className={`absolute -right-8 -top-8 h-20 w-20 rounded-full ${isDark ? "bg-[#1e3a8a]" : "bg-[#ffbfa5]"} opacity-70`} />
        <Text className={`text-xs font-bold uppercase tracking-[1.8px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>IoT Device</Text>
        <Text className={`mt-2 text-xl font-extrabold ${isDark ? "text-[#f9fafb]" : "text-[#111827]"}`}>{title}</Text>
        <Text className={`mt-1 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Firmware {firmwareVersion ?? "unknown"}</Text>
        <Text className={`mt-1 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>{formatSyncLabel(lastSyncedAt)}</Text>

        <Pressable
          className="mt-4 rounded-2xl bg-[#fc4c02] px-4 py-3"
          onPress={runSync}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-center text-base font-black text-white">Refresh Ride Telemetry</Text>
          )}
        </Pressable>
        {error ? <Text className="mt-3 text-sm text-[#dc2626]">{error}</Text> : null}
      </View>

      <View className={`mt-5 flex-row rounded-2xl border p-1 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <Pressable
          className={`flex-1 rounded-xl px-3 py-2 ${segment === "rides" ? "bg-[#fc4c02]" : "bg-transparent"}`}
          onPress={() => setSegment("rides")}
        >
            <Text className={`text-center font-semibold ${segment === "rides" ? "text-white" : isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>
            Ride Logs ({sessions.length})
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-xl px-3 py-2 ${segment === "device" ? "bg-[#fc4c02]" : "bg-transparent"}`}
          onPress={() => setSegment("device")}
        >
            <Text className={`text-center font-semibold ${segment === "device" ? "text-white" : isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>
            Device Sync ({syncStatuses.length})
          </Text>
        </Pressable>
      </View>

      {segment === "rides" ? (
        <View className="mt-4 gap-3">
          {sessions.map((session) => (
            <View
              key={session.id}
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4"
            >
              <Text className="text-lg font-semibold text-[#111827]">{session.title}</Text>
              <Text className="mt-1 text-xs uppercase tracking-wide text-[#fc4c02]">
                {new Date(session.startAt).toLocaleString()}
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Distance</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{formatDistance(session.distanceMeters)}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Time</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{formatDuration(session.durationSeconds)}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Avg Speed</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{session.avgSpeedKmh} km/h</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Turns</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{session.turnCount}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Packets</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{session.instructionPackets}</Text>
                </View>
              </View>
            </View>
          ))}
          {!sessions.length ? (
            <Text className="text-sm text-[#6b7280]">No ride logs yet. Refresh to load telemetry snapshot.</Text>
          ) : null}
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {syncStatuses.map((item) => (
            <View
              key={item.id}
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-[#111827]">{item.routeName}</Text>
                <Text className={`text-xs font-bold ${item.status === "healthy" ? "text-[#16a34a]" : "text-[#d97706]"}`}>
                  {item.status === "healthy" ? "HEALTHY" : "CHECK"}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-[#6b7280]">Updated {new Date(item.updatedAt).toLocaleString()}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Sent</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{item.packetsSent}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Acknowledged</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{item.packetsAcknowledged}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Avg Latency</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{item.averageLatencyMs} ms</Text>
                </View>
              </View>
            </View>
          ))}
          {!syncStatuses.length ? <Text className="text-sm text-[#6b7280]">No device sync data yet.</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}
