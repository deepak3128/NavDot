import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type UnitPreference = "kmh" | "mph";

export type DisplaySchedule = {
  startHour: number;
  endHour: number;
};

type SettingsState = {
  defaultZoom: number;
  autoDimTimeoutSec: number;
  schedule: DisplaySchedule;
  units: UnitPreference;
  setDefaultZoom: (value: number) => void;
  setAutoDimTimeoutSec: (value: number) => void;
  setSchedule: (value: DisplaySchedule) => void;
  setUnits: (value: UnitPreference) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultZoom: 15,
      autoDimTimeoutSec: 20,
      schedule: {
        startHour: 6,
        endHour: 23
      },
      units: "kmh",
      setDefaultZoom: (value) => set({ defaultZoom: value }),
      setAutoDimTimeoutSec: (value) => set({ autoDimTimeoutSec: value }),
      setSchedule: (value) => set({ schedule: value }),
      setUnits: (value) => set({ units: value })
    }),
    {
      name: "navdot-settings",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
