import { create } from "zustand";

type NavState = {
  hasGpsFix: boolean;
  latitude?: number;
  longitude?: number;
  speedMps?: number;
  heading: number;
  zoomLevel: number;
  isOnline: boolean;
  statusMessage: string;
  encodedTileSummary?: string;
  setLocation: (payload: {
    latitude: number;
    longitude: number;
    speedMps?: number;
    hasGpsFix: boolean;
  }) => void;
  setHeading: (heading: number) => void;
  setZoomLevel: (zoomLevel: number) => void;
  setIsOnline: (isOnline: boolean) => void;
  setStatusMessage: (message: string) => void;
  setEncodedTileSummary: (value?: string) => void;
};

export const useNavStore = create<NavState>((set) => ({
  hasGpsFix: false,
  heading: 0,
  zoomLevel: 15,
  isOnline: true,
  statusMessage: "Waiting for GPS fix...",
  setLocation: (payload) =>
    set({
      latitude: payload.latitude,
      longitude: payload.longitude,
      speedMps: payload.speedMps,
      hasGpsFix: payload.hasGpsFix
    }),
  setHeading: (heading) => set({ heading }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setEncodedTileSummary: (encodedTileSummary) => set({ encodedTileSummary })
}));
