import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ScannedDevice = {
  id: string;
  name: string;
  rssi: number;
};

type BleState = {
  devices: ScannedDevice[];
  isScanning: boolean;
  isConnected: boolean;
  connectedDeviceId?: string;
  connectedDeviceName?: string;
  preferredDeviceId?: string;
  preferredDeviceName?: string;
  error?: string;
  setScanning: (isScanning: boolean) => void;
  setDevices: (devices: ScannedDevice[]) => void;
  setConnectedDevice: (id?: string, name?: string) => void;
  setPreferredDevice: (id?: string, name?: string) => void;
  setError: (error?: string) => void;
};

export const useBleStore = create<BleState>()(
  persist(
    (set) => ({
      devices: [],
      isScanning: false,
      isConnected: false,
      setScanning: (isScanning) => set({ isScanning }),
      setDevices: (devices) => set({ devices }),
      setConnectedDevice: (id, name) =>
        set({
          isConnected: Boolean(id),
          connectedDeviceId: id,
          connectedDeviceName: name
        }),
      setPreferredDevice: (id, name) =>
        set({
          preferredDeviceId: id,
          preferredDeviceName: name
        }),
      setError: (error) => set({ error })
    }),
    {
      name: "navdot-ble",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferredDeviceId: state.preferredDeviceId,
        preferredDeviceName: state.preferredDeviceName
      })
    }
  )
);
