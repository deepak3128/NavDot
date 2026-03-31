import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";
import { useBleStore } from "../store/useBleStore";

type BleModule = typeof import("react-native-ble-plx");

const bleModule: BleModule | undefined =
  Platform.OS === "web" ? undefined : (require("react-native-ble-plx") as BleModule);

const NAVDOT_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const NAVDOT_HEADING_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";

class BleService {
  private manager?: import("react-native-ble-plx").BleManager;
  private connectedDevice?: import("react-native-ble-plx").Device;

  constructor() {
    if (!bleModule) {
      return;
    }

    try {
      this.manager = new bleModule.BleManager();
    } catch {
      this.manager = undefined;
    }
  }

  private ensureAvailable(): boolean {
    if (this.manager) {
      return true;
    }

    useBleStore
      .getState()
      .setError("BLE native module is unavailable. Use a development build on Android/iOS (Expo Go is not supported).");
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") {
      return true;
    }

    if (Platform.Version < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ];

    const result = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
  }

  async waitForPoweredOn(): Promise<void> {
    if (!this.ensureAvailable()) {
      return;
    }

    const manager = this.manager!;
    const state = await manager.state();
    if (state === "PoweredOn") {
      return;
    }

    await new Promise<void>((resolve) => {
      const subscription = manager.onStateChange((nextState) => {
        if (nextState === "PoweredOn") {
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  async startScan(): Promise<void> {
    if (!this.ensureAvailable()) {
      return;
    }

    const manager = this.manager!;

    const store = useBleStore.getState();
    store.setDevices([]);
    store.setScanning(true);
    store.setError(undefined);

    const seen = new Map<string, { id: string; name: string; rssi: number }>();

    manager.startDeviceScan([NAVDOT_SERVICE_UUID], null, (error, device) => {
      if (error) {
        useBleStore.getState().setError(error.message);
        useBleStore.getState().setScanning(false);
        return;
      }

      if (!device?.id) {
        return;
      }

      const name = device.name || device.localName || "NavDot device";
      const rssi = device.rssi ?? -100;
      seen.set(device.id, { id: device.id, name, rssi });

      const devices = [...seen.values()].sort((a, b) => b.rssi - a.rssi);
      useBleStore.getState().setDevices(devices);
    });

    setTimeout(() => {
      this.stopScan();
    }, 10000);
  }

  stopScan(): void {
    if (!this.manager) {
      return;
    }

    this.manager.stopDeviceScan();
    useBleStore.getState().setScanning(false);
  }

  async connect(deviceId: string): Promise<void> {
    if (!this.ensureAvailable()) {
      return;
    }

    const manager = this.manager!;

    try {
      const device = await manager.connectToDevice(deviceId, { autoConnect: false });
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;

      const name = device.name || device.localName || "NavDot device";
      const store = useBleStore.getState();
      store.setConnectedDevice(device.id, name);
      store.setPreferredDevice(device.id, name);
      store.setError(undefined);

      device.onDisconnected(() => {
        this.connectedDevice = undefined;
        useBleStore.getState().setConnectedDevice(undefined, undefined);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "BLE connection failed";
      useBleStore.getState().setError(message);
      throw error;
    }
  }

  async autoConnectPreferredDevice(): Promise<void> {
    if (!this.manager) {
      return;
    }

    const preferred = useBleStore.getState().preferredDeviceId;
    if (!preferred) {
      return;
    }

    try {
      await this.connect(preferred);
    } catch {
      useBleStore.getState().setError("Failed to auto-connect preferred device.");
    }
  }

  async writeHeadingPacket(packet: {
    heading: number;
    latitude?: number;
    longitude?: number;
    speedMps?: number;
    zoom: number;
    destination?: {
      latitude: number;
      longitude: number;
      label?: string;
    };
  }): Promise<void> {
    if (!this.connectedDevice || !this.manager) {
      return;
    }

    const payload = JSON.stringify({
      ts: Date.now(),
      heading: Number(packet.heading.toFixed(2)),
      latitude: packet.latitude,
      longitude: packet.longitude,
      speedMps: packet.speedMps,
      zoom: packet.zoom,
      destination: packet.destination
        ? {
            latitude: Number(packet.destination.latitude.toFixed(6)),
            longitude: Number(packet.destination.longitude.toFixed(6)),
            label: packet.destination.label ?? "selected_pin"
          }
        : undefined
    });

    const base64Payload = Buffer.from(payload, "utf-8").toString("base64");
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      NAVDOT_SERVICE_UUID,
      NAVDOT_HEADING_CHAR_UUID,
      base64Payload
    );
  }

  async writeDestinationPacket(packet: {
    latitude: number;
    longitude: number;
    label?: string;
  }): Promise<void> {
    if (!this.connectedDevice || !this.manager) {
      throw new Error("No connected BLE device.");
    }

    const payload = JSON.stringify({
      ts: Date.now(),
      type: "destination",
      latitude: Number(packet.latitude.toFixed(6)),
      longitude: Number(packet.longitude.toFixed(6)),
      label: packet.label ?? "map_pin"
    });

    const base64Payload = Buffer.from(payload, "utf-8").toString("base64");
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      NAVDOT_SERVICE_UUID,
      NAVDOT_HEADING_CHAR_UUID,
      base64Payload
    );
  }
}

export const bleService = new BleService();
