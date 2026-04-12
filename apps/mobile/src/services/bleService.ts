import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";
import { useBleStore } from "../store/useBleStore";

type BleModule = typeof import("react-native-ble-plx");

const bleModule: BleModule | undefined =
  Platform.OS === "web" ? undefined : (require("react-native-ble-plx") as BleModule);

const NAVDOT_DEVICE_NAME = "navdot";
const NAVDOT_SERVICE_UUID = "0000FF00-0000-1000-8000-00805F9B34FB";
const NAVDOT_WRITE_CHAR_UUID = "0000FF01-0000-1000-8000-00805F9B34FB";

function normalizeUuid(value: string | undefined): string {
  return (value ?? "").replace(/-/g, "").toLowerCase();
}

function uuidMatches(target: string, candidate: string | undefined): boolean {
  const targetNormalized = normalizeUuid(target);
  const candidateNormalized = normalizeUuid(candidate);
  return targetNormalized === candidateNormalized || targetNormalized.endsWith(candidateNormalized) || candidateNormalized.endsWith(targetNormalized);
}

class BleService {
  private manager?: import("react-native-ble-plx").BleManager;
  private connectedDevice?: import("react-native-ble-plx").Device;
  private scanStopTimer?: ReturnType<typeof setTimeout>;
  private requestedMtu?: number;
  private negotiatedMtu?: number;
  private writeSequence = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private lastCriticalFingerprint?: { key: string; at: number };
  private cachedWriteCharacteristic?: {
    serviceUUID: string;
    characteristicUUID: string;
  };

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

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error("Bluetooth is off. Please turn on Bluetooth and try again."));
      }, 8000);

      const subscription = manager.onStateChange((nextState) => {
        if (nextState === "PoweredOn") {
          clearTimeout(timeout);
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  async isPoweredOn(): Promise<boolean> {
    if (!this.ensureAvailable()) {
      return false;
    }

    const manager = this.manager!;
    return (await manager.state()) === "PoweredOn";
  }

  async startScan(): Promise<void> {
    if (!this.ensureAvailable()) {
      return;
    }

    const manager = this.manager!;
    this.stopScan();

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

      const name = device.name || device.localName || "Unknown device";
      if (!name.toLowerCase().includes(NAVDOT_DEVICE_NAME)) {
        return;
      }

      const rssi = device.rssi ?? -100;
      seen.set(device.id, { id: device.id, name, rssi });

      const devices = [...seen.values()]
        .sort((a, b) => b.rssi - a.rssi)
        .slice(0, 25);
      useBleStore.getState().setDevices(devices);
    });

    this.scanStopTimer = setTimeout(() => {
      this.stopScan();
    }, 10000);
  }

  stopScan(): void {
    if (!this.manager) {
      return;
    }

    if (this.scanStopTimer) {
      clearTimeout(this.scanStopTimer);
      this.scanStopTimer = undefined;
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

      if (Platform.OS === "android") {
        try {
          this.requestedMtu = 247;
          const mtuDevice = await device.requestMTU(247);
          this.negotiatedMtu = mtuDevice.mtu;
        } catch {
          // Some devices/OS versions reject MTU change. Keep default and continue.
          this.negotiatedMtu = undefined;
        }
      }

      this.connectedDevice = device;
      this.cachedWriteCharacteristic = undefined;

      await this.cacheWriteCharacteristic(device);

      const name = device.name || device.localName || "NavDot device";
      const store = useBleStore.getState();
      store.setConnectedDevice(device.id, name);
      store.setPreferredDevice(device.id, name);
      store.setError(undefined);

      device.onDisconnected(() => {
        this.connectedDevice = undefined;
        this.cachedWriteCharacteristic = undefined;
        this.negotiatedMtu = undefined;
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
      seq: ++this.writeSequence,
      kind: "telemetry",
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
    await this.enqueueWrite(() => this.writeToNavDot(base64Payload));
  }

  async writeDestinationPacket(packet: {
    latitude: number;
    longitude: number;
    label?: string;
  }): Promise<void> {
    if (!this.connectedDevice || !this.manager) {
      throw new Error("No connected BLE device.");
    }

    const criticalFingerprint = `destination|${packet.latitude.toFixed(6)}|${packet.longitude.toFixed(6)}|${packet.label ?? "map_pin"}`;
    if (this.shouldSuppressCriticalPacket(criticalFingerprint)) {
      return;
    }

    const payload = JSON.stringify({
      ts: Date.now(),
      seq: ++this.writeSequence,
      type: "destination",
      latitude: Number(packet.latitude.toFixed(6)),
      longitude: Number(packet.longitude.toFixed(6)),
      label: packet.label ?? "map_pin"
    });

    const base64Payload = Buffer.from(payload, "utf-8").toString("base64");
    await this.enqueueCriticalWrite(() => this.writeToNavDot(base64Payload));
    this.lastCriticalFingerprint = { key: criticalFingerprint, at: Date.now() };
  }

  async writeNavigationDataPacket(packet: {
    direction: string;
    distance: number;
    speed: number;
    polyline: Array<[number, number]>;
  }): Promise<void> {
    if (!this.connectedDevice || !this.manager) {
      throw new Error("No connected BLE device.");
    }

    const criticalFingerprint = `navigation|${packet.direction}|${Math.round(packet.distance)}|${Math.round(packet.speed)}|${JSON.stringify(packet.polyline)}`;
    if (this.shouldSuppressCriticalPacket(criticalFingerprint)) {
      return;
    }

    const payload = JSON.stringify({
      ts: Date.now(),
      seq: ++this.writeSequence,
      type: "navigation",
      direction: packet.direction,
      distance: Math.max(0, Math.round(packet.distance)),
      speed: Math.max(0, Math.round(packet.speed)),
      polyline: packet.polyline
    });

    const base64Payload = Buffer.from(payload, "utf-8").toString("base64");
    await this.enqueueCriticalWrite(() => this.writeToNavDot(base64Payload));
    this.lastCriticalFingerprint = { key: criticalFingerprint, at: Date.now() };
  }

  private shouldSuppressCriticalPacket(nextFingerprint: string): boolean {
    if (!this.lastCriticalFingerprint) {
      return false;
    }

    const isDuplicate = this.lastCriticalFingerprint.key === nextFingerprint;
    const isWithinWindow = Date.now() - this.lastCriticalFingerprint.at < 1200;
    return isDuplicate && isWithinWindow;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const scheduled = this.writeChain.then(operation);
    this.writeChain = scheduled.catch(() => undefined);
    return scheduled;
  }

  private async enqueueCriticalWrite(operation: () => Promise<void>): Promise<void> {
    return this.enqueueWrite(async () => {
      let attempt = 0;
      let lastError: unknown;

      while (attempt < 3) {
        attempt += 1;
        try {
          await operation();
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Critical BLE write failed after retries.");
    });
  }

  private async cacheWriteCharacteristic(device: import("react-native-ble-plx").Device): Promise<void> {
    const services = await device.services();

    for (const service of services) {
      const isNavDotService = uuidMatches(NAVDOT_SERVICE_UUID, service.uuid);
      if (!isNavDotService) {
        continue;
      }

      const characteristics = await device.characteristicsForService(service.uuid);
      const writable = characteristics.find(
        (characteristic) =>
          uuidMatches(NAVDOT_WRITE_CHAR_UUID, characteristic.uuid) &&
          (characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse)
      );

      if (writable) {
        this.cachedWriteCharacteristic = {
          serviceUUID: service.uuid,
          characteristicUUID: writable.uuid
        };
        return;
      }
    }

    throw new Error("Could not find writable NavDot characteristic (0xFF01).");
  }

  private async writeToNavDot(base64Payload: string): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error("No connected BLE device.");
    }

    if (!this.cachedWriteCharacteristic) {
      await this.cacheWriteCharacteristic(this.connectedDevice);
    }

    const target = this.cachedWriteCharacteristic!;
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      target.serviceUUID,
      target.characteristicUUID,
      base64Payload
    );
  }

  getDebugState(): {
    deviceId?: string;
    deviceName?: string;
    requestedMtu?: number;
    negotiatedMtu?: number;
    cachedServiceUuid?: string;
    cachedCharacteristicUuid?: string;
  } {
    const deviceName = this.connectedDevice?.name ?? this.connectedDevice?.localName ?? undefined;

    return {
      deviceId: this.connectedDevice?.id,
      deviceName,
      requestedMtu: this.requestedMtu,
      negotiatedMtu: this.negotiatedMtu,
      cachedServiceUuid: this.cachedWriteCharacteristic?.serviceUUID,
      cachedCharacteristicUuid: this.cachedWriteCharacteristic?.characteristicUUID
    };
  }
}

export const bleService = new BleService();
