import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import * as Location from "expo-location";
import MapView, { LongPressEvent, Marker, Region } from "react-native-maps";
import { bleService } from "../services/bleService";
import { sendDestinationToBackend } from "../services/backendService";
import { useBleStore } from "../store/useBleStore";

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02
};

export function PairingScreen() {
  const [busyId, setBusyId] = useState<string | undefined>();
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedDestination, setSelectedDestination] = useState<{ latitude: number; longitude: number }>();
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | undefined>();
  const { devices, isScanning, isConnected, connectedDeviceId, connectedDeviceName, preferredDeviceName, error } =
    useBleStore();

  useEffect(() => {
    const bootstrapLocation = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setMapRegion((previous) => ({
        ...previous,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      }));
    };

    void bootstrapLocation();
  }, []);

  const handleScan = async () => {
    const granted = await bleService.requestPermissions();
    if (!granted) {
      useBleStore.getState().setError("Bluetooth permission denied.");
      return;
    }

    await bleService.waitForPoweredOn();
    await bleService.startScan();
  };

  const connect = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await bleService.connect(deviceId);
    } finally {
      setBusyId(undefined);
    }
  };

  const selectDestination = (event: LongPressEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    setSelectedDestination({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude
    });
    setSendMessage(undefined);
  };

  const sendDestination = async () => {
    if (!selectedDestination) {
      setSendMessage("Long-press map to choose a destination pin.");
      return;
    }

    if (!connectedDeviceId) {
      setSendMessage("Pair a device before sending a destination.");
      return;
    }

    setSendBusy(true);
    setSendMessage(undefined);

    try {
      await bleService.writeDestinationPacket({
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
        label: "selected_pin"
      });

      await sendDestinationToBackend({
        deviceId: connectedDeviceId,
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
        label: "selected_pin",
        source: "mobile-map"
      });

      setSendMessage("Destination sent to device and synced to backend.");
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send destination.";
      setSendMessage(message);
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#f3f4f6] px-5 pt-6" contentContainerStyle={{ paddingBottom: 92 }}>
      <View className="absolute -left-12 -top-10 h-40 w-40 rounded-full bg-[#ffbfa5] opacity-75" />
      <View className="absolute -right-14 top-32 h-36 w-36 rounded-full bg-[#bcd5ff] opacity-75" />

      <Text className="text-3xl font-black tracking-tight text-[#111827]">Pair Device</Text>
      <Text className="mt-1 text-sm leading-6 text-[#4b5563]">
        Connect hardware, choose a destination on map, and push it straight to your IoT device.
      </Text>

      <View className="mt-5 rounded-3xl border border-[#e5e7eb] bg-white p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Connection</Text>
          <Text className={`text-xs font-bold ${isConnected ? "text-[#059669]" : "text-[#dc2626]"}`}>
            {isConnected ? "CONNECTED" : "DISCONNECTED"}
          </Text>
        </View>
        <Text className="mt-2 text-xl font-extrabold text-[#111827]">
          {isConnected ? connectedDeviceName ?? "NavDot Device" : "No device selected"}
        </Text>
        <Text className="mt-1 text-xs text-[#6b7280]">
          {preferredDeviceName ? `Preferred: ${preferredDeviceName}` : "Pick one device to save as preferred."}
        </Text>

        <Pressable className="mt-4 rounded-2xl bg-[#fc4c02] px-4 py-3.5" onPress={handleScan} disabled={isScanning}>
          <Text className="text-center text-sm font-black tracking-wide text-white">
            {isScanning ? "Scanning devices..." : "Scan For Devices"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text className="mt-3 text-sm text-[#dc2626]">{error}</Text> : null}

      <View className="mt-5 rounded-3xl border border-[#e5e7eb] bg-white p-4">
        <Text className="text-xs font-bold uppercase tracking-[1.8px] text-[#6b7280]">Map Destination</Text>
        <Text className="mt-1 text-xs text-[#6b7280]">Long-press anywhere on the map to place destination pin.</Text>

        <View className="mt-3 h-64 overflow-hidden rounded-2xl border border-[#e5e7eb]">
          <MapView
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            onLongPress={selectDestination}
            showsUserLocation
            showsMyLocationButton
          >
            {selectedDestination ? (
              <Marker coordinate={selectedDestination} title="Selected destination" description="Will be sent to NavDot" />
            ) : null}
          </MapView>
        </View>

        <View className="mt-3 rounded-xl bg-[#f9fafb] px-3 py-2">
          <Text className="text-xs text-[#6b7280]">Selected Coordinates</Text>
          <Text className="mt-1 text-sm font-bold text-[#111827]">
            {selectedDestination
              ? `${selectedDestination.latitude.toFixed(6)}, ${selectedDestination.longitude.toFixed(6)}`
              : "No destination selected"}
          </Text>
        </View>

        <Pressable className="mt-3 rounded-2xl bg-[#111827] px-4 py-3" onPress={() => void sendDestination()} disabled={sendBusy}>
          {sendBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-center text-sm font-bold tracking-wide text-white">Send Destination To Device</Text>
          )}
        </Pressable>
        {sendMessage ? <Text className="mt-2 text-xs text-[#374151]">{sendMessage}</Text> : null}
      </View>

      <View className="mt-5 gap-3">
        {devices.map((device) => (
          <View key={device.id} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-[#111827]">{device.name}</Text>
              <Text className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-semibold text-[#4b5563]">
                RSSI {device.rssi}
              </Text>
            </View>
            <Pressable
              className="mt-3 rounded-xl border border-[#fc4c02] bg-[#fff5f1] px-3 py-2.5"
              onPress={() => connect(device.id)}
              disabled={busyId === device.id}
            >
              {busyId === device.id ? (
                <ActivityIndicator color="#fc4c02" />
              ) : (
                <Text className="text-center font-bold tracking-wide text-[#fc4c02]">Pair + Connect</Text>
              )}
            </Pressable>
          </View>
        ))}
        {!devices.length && !isScanning ? (
          <View className="rounded-2xl border border-dashed border-[#d1d5db] bg-white px-4 py-5">
            <Text className="text-sm text-[#6b7280]">No devices found yet. Tap scan to discover nearby devices.</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
