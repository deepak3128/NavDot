import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type UnitPreference = "kmh" | "mph";
export type ThemeMode = "light" | "dark";

export type DisplaySchedule = {
  startHour: number;
  endHour: number;
};

type SettingsState = {
  defaultZoom: number;
  autoDimTimeoutSec: number;
  schedule: DisplaySchedule;
  units: UnitPreference;
  themeMode: ThemeMode;
  setDefaultZoom: (value: number) => void;
  setAutoDimTimeoutSec: (value: number) => void;
  setSchedule: (value: DisplaySchedule) => void;
  setUnits: (value: UnitPreference) => void;
  setThemeMode: (value: ThemeMode) => void;
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
      themeMode: "light",
      setDefaultZoom: (value) => set({ defaultZoom: value }),
      setAutoDimTimeoutSec: (value) => set({ autoDimTimeoutSec: value }),
      setSchedule: (value) => set({ schedule: value }),
      setUnits: (value) => set({ units: value }),
      setThemeMode: (value) => set({ themeMode: value })
    }),
    {
      name: "navdot-settings",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
