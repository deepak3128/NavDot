import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { StravaActivity, StravaAthlete, StravaRoute } from "../services/stravaService";

type StravaState = {
  athlete?: StravaAthlete;
  activities: StravaActivity[];
  routes: StravaRoute[];
  isLoading: boolean;
  error?: string;
  lastSyncedAt?: string;
  setLoading: (value: boolean) => void;
  setError: (value?: string) => void;
  setImportData: (payload: {
    athlete: StravaAthlete;
    activities: StravaActivity[];
    routes: StravaRoute[];
  }) => void;
  clear: () => void;
};

export const useStravaStore = create<StravaState>()(
  persist(
    (set) => ({
      activities: [],
      routes: [],
      isLoading: false,
      setLoading: (value) => set({ isLoading: value }),
      setError: (value) => set({ error: value }),
      setImportData: (payload) =>
        set({
          athlete: payload.athlete,
          activities: payload.activities,
          routes: payload.routes,
          error: undefined,
          lastSyncedAt: new Date().toISOString()
        }),
      clear: () =>
        set({
          athlete: undefined,
          activities: [],
          routes: [],
          error: undefined,
          lastSyncedAt: undefined
        })
    }),
    {
      name: "navdot-strava",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
