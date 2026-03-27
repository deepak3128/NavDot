import { View, Text } from "react-native";
import { useNavStore } from "../store/useNavStore";
import { useSettingsStore } from "../store/useSettingsStore";

function speedLabel(speedMps?: number, units: "kmh" | "mph" = "kmh"): string {
  if (!speedMps) {
    return "0";
  }

  if (units === "mph") {
    return (speedMps * 2.23694).toFixed(1);
  }

  return (speedMps * 3.6).toFixed(1);
}

export function DevicePreview() {
  const { heading, speedMps, statusMessage } = useNavStore();
  const units = useSettingsStore((state) => state.units);

  return (
    <View className="rounded-3xl border border-[#2d3b4f] bg-[#131a22] p-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-[2px] text-[#8fa1b8]">ESP32 Live Preview</Text>
        <View className="rounded-full border border-[#364b65] bg-[#1b2633] px-2 py-1">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-[#ffb08a]">Live</Text>
        </View>
      </View>
      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text className="text-4xl font-black text-[#7dd3fc]">{Math.round(heading)}°</Text>
          <Text className="mt-1 text-sm text-[#a9b8ca]">Heading</Text>
        </View>
        <View className="items-end">
          <Text className="text-3xl font-black text-[#7ee2b8]">{speedLabel(speedMps, units)}</Text>
          <Text className="mt-1 text-sm text-[#a9b8ca]">{units === "mph" ? "mph" : "km/h"}</Text>
        </View>
      </View>
      <View className="mt-4 rounded-xl bg-[#0f141b] px-3 py-2">
        <Text className="text-xs text-[#8fa1b8]">{statusMessage}</Text>
      </View>
    </View>
  );
}
