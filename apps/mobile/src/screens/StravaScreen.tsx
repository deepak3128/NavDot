import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { importStravaActivitiesAndRoutes } from "../services/stravaService";
import { useSettingsStore } from "../store/useSettingsStore";
import { useStravaStore } from "../store/useStravaStore";

type Segment = "activities" | "routes";

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
    return "Not synced yet";
  }

  return `Last sync ${new Date(iso).toLocaleString()}`;
}

export function StravaScreen() {
  const [segment, setSegment] = useState<Segment>("activities");

  const token = useSettingsStore((state) => state.stravaAccessToken);
  const { athlete, activities, routes, isLoading, error, setError, setLoading, setImportData } = useStravaStore();
  const lastSyncedAt = useStravaStore((state) => state.lastSyncedAt);

  const title = useMemo(() => {
    if (!athlete) {
      return "Activity Sync";
    }

    return `${athlete.firstname} ${athlete.lastname}`.trim();
  }, [athlete]);

  const runSync = async () => {
    setLoading(true);
    setError(undefined);

    try {
      const payload = await importStravaActivitiesAndRoutes(token);
      setImportData(payload);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Failed to import activity data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#f3f4f6] px-5 pt-6 pb-8" contentContainerStyle={{ paddingBottom: 92 }}>
      <View className="absolute -left-10 -top-6 h-36 w-36 rounded-full bg-[#ffbfa5] opacity-68" />
      <View className="absolute -right-10 top-28 h-36 w-36 rounded-full bg-[#bcd5ff] opacity-68" />

      <Text className="text-3xl font-black tracking-tight text-[#111827]">Activities</Text>
      <Text className="mt-1 text-sm leading-6 text-[#4b5563]">
        Import your latest workouts and routes into NavDot with a clean training dashboard.
      </Text>

      <View className="mt-5 overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <View className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[#ffbfa5] opacity-70" />
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Athlete</Text>
        <Text className="mt-2 text-xl font-extrabold text-[#111827]">{title}</Text>
        <Text className="mt-1 text-xs text-[#6b7280]">{formatSyncLabel(lastSyncedAt)}</Text>

        <Pressable
          className="mt-4 rounded-2xl bg-[#fc4c02] px-4 py-3"
          onPress={runSync}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-center text-base font-black text-white">Import Activities + Routes</Text>
          )}
        </Pressable>

        {!token.trim() ? (
          <Text className="mt-3 text-xs text-[#b45309]">
            Add your fitness access token in Settings to enable import.
          </Text>
        ) : null}
        {error ? <Text className="mt-3 text-sm text-[#dc2626]">{error}</Text> : null}
      </View>

      <View className="mt-5 flex-row rounded-2xl border border-[#e5e7eb] bg-white p-1">
        <Pressable
          className={`flex-1 rounded-xl px-3 py-2 ${segment === "activities" ? "bg-[#fc4c02]" : "bg-transparent"}`}
          onPress={() => setSegment("activities")}
        >
          <Text className={`text-center font-semibold ${segment === "activities" ? "text-white" : "text-[#6b7280]"}`}>
            Activities ({activities.length})
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-xl px-3 py-2 ${segment === "routes" ? "bg-[#fc4c02]" : "bg-transparent"}`}
          onPress={() => setSegment("routes")}
        >
          <Text className={`text-center font-semibold ${segment === "routes" ? "text-white" : "text-[#6b7280]"}`}>
            Routes ({routes.length})
          </Text>
        </Pressable>
      </View>

      {segment === "activities" ? (
        <View className="mt-4 gap-3">
          {activities.map((activity) => (
            <View
              key={activity.id}
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4"
            >
              <Text className="text-lg font-semibold text-[#111827]">{activity.name}</Text>
              <Text className="mt-1 text-xs uppercase tracking-wide text-[#fc4c02]">{activity.type}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Distance</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{formatDistance(activity.distance)}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Time</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{formatDuration(activity.moving_time)}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Pace</Text>
                  <Text className="text-sm font-semibold text-[#111827]">
                    {formatPace(activity.distance, activity.moving_time)}
                  </Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Elevation</Text>
                  <Text className="text-sm font-semibold text-[#111827]">
                    {Math.round(activity.total_elevation_gain)} m
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {!activities.length ? (
            <Text className="text-sm text-[#6b7280]">No imported activities yet.</Text>
          ) : null}
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {routes.map((route) => (
            <View
              key={route.id}
              className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4"
            >
              <Text className="text-lg font-semibold text-[#111827]">{route.name}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Distance</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{formatDistance(route.distance)}</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Elevation</Text>
                  <Text className="text-sm font-semibold text-[#111827]">{Math.round(route.elevation_gain)} m</Text>
                </View>
                <View className="rounded-xl bg-[#f9fafb] px-3 py-2">
                  <Text className="text-xs text-[#6b7280]">Est. Time</Text>
                  <Text className="text-sm font-semibold text-[#111827]">
                    {formatDuration(route.estimated_moving_time)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {!routes.length ? <Text className="text-sm text-[#6b7280]">No imported routes yet.</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}
