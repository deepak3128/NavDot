import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DeviceSyncStatus, RideSession } from "../services/stravaService";

type StravaState = {
  deviceName?: string;
  firmwareVersion?: string;
  sessions: RideSession[];
  syncStatuses: DeviceSyncStatus[];
  isLoading: boolean;
  error?: string;
  lastSyncedAt?: string;
  setLoading: (value: boolean) => void;
  setError: (value?: string) => void;
  setImportData: (payload: {
    deviceName: string;
    firmwareVersion: string;
    sessions: RideSession[];
    syncStatuses: DeviceSyncStatus[];
  }) => void;
  clear: () => void;
};

export const useStravaStore = create<StravaState>()(
  persist(
    (set) => ({
      sessions: [],
      syncStatuses: [],
      isLoading: false,
      setLoading: (value) => set({ isLoading: value }),
      setError: (value) => set({ error: value }),
      setImportData: (payload) =>
        set({
          deviceName: payload.deviceName,
          firmwareVersion: payload.firmwareVersion,
          sessions: payload.sessions,
          syncStatuses: payload.syncStatuses,
          error: undefined,
          lastSyncedAt: new Date().toISOString()
        }),
      clear: () =>
        set({
          deviceName: undefined,
          firmwareVersion: undefined,
          sessions: [],
          syncStatuses: [],
          error: undefined,
          lastSyncedAt: undefined
        })
    }),
    {
      name: "navdot-strava",
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState, version) => {
        if (!persistedState || version >= 2) {
          return persistedState as StravaState;
        }

        return {
          deviceName: undefined,
          firmwareVersion: undefined,
          sessions: [],
          syncStatuses: [],
          isLoading: false,
          error: undefined,
          lastSyncedAt: undefined,
          setLoading: () => undefined,
          setError: () => undefined,
          setImportData: () => undefined,
          clear: () => undefined
        } as StravaState;
      }
    }
  )
);
