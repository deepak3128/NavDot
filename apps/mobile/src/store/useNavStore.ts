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
  isRideModeActive: boolean;
  rideCommandToken: number;
  currentDirection?: string;
  distance?: number;
  speed?: number;
  polyline: Array<[number, number]>;
  isRouteDirty: boolean;
  cachedRouteSignature?: string;
  lastRoutePacketSentAt?: number;
  destination?: {
    latitude: number;
    longitude: number;
    label?: string;
    updatedAt: string;
  };
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
  startRideMode: () => void;
  stopRideMode: () => void;
  setNavigationRoute: (payload: {
    currentDirection: string;
    distance: number;
    polyline: Array<[number, number]>;
    speed?: number;
  }) => void;
  setNavigationTelemetry: (payload: { speed?: number }) => void;
  markNavigationRouteClean: () => void;
  resetNavigationRoute: () => void;
  setDestination: (payload: { latitude: number; longitude: number; label?: string }) => void;
  clearDestination: () => void;
};

function createRouteSignature(payload: {
  currentDirection: string;
  distance: number;
  polyline: Array<[number, number]>;
}): string {
  return JSON.stringify({
    currentDirection: payload.currentDirection,
    distance: Math.round(payload.distance),
    polyline: payload.polyline
  });
}

export const useNavStore = create<NavState>((set) => ({
  hasGpsFix: false,
  heading: 0,
  zoomLevel: 15,
  isOnline: true,
  statusMessage: "Waiting for GPS fix...",
  isRideModeActive: false,
  rideCommandToken: 0,
  polyline: [],
  isRouteDirty: false,
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
  setEncodedTileSummary: (encodedTileSummary) => set({ encodedTileSummary }),
  startRideMode: () =>
    set((state) => ({
      isRideModeActive: true,
      rideCommandToken: state.rideCommandToken + 1
    })),
  stopRideMode: () => set({ isRideModeActive: false }),
  setNavigationRoute: (payload) =>
    set((state) => {
      const signature = createRouteSignature(payload);
      const isChanged = signature !== state.cachedRouteSignature;

      return {
        currentDirection: payload.currentDirection,
        distance: payload.distance,
        speed: payload.speed ?? state.speed,
        polyline: payload.polyline,
        cachedRouteSignature: signature,
        isRouteDirty: isChanged ? true : state.isRouteDirty
      };
    }),
  setNavigationTelemetry: (payload) =>
    set((state) => ({
      speed: payload.speed ?? state.speed
    })),
  markNavigationRouteClean: () =>
    set({
      isRouteDirty: false,
      lastRoutePacketSentAt: Date.now()
    }),
  resetNavigationRoute: () =>
    set({
      currentDirection: undefined,
      distance: undefined,
      speed: undefined,
      polyline: [],
      isRouteDirty: false,
      cachedRouteSignature: undefined,
      lastRoutePacketSentAt: undefined
    }),
  setDestination: (payload) =>
    set({
      destination: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        label: payload.label,
        updatedAt: new Date().toISOString()
      }
    }),
  clearDestination: () =>
    set({
      destination: undefined,
      currentDirection: undefined,
      distance: undefined,
      speed: undefined,
      polyline: [],
      isRouteDirty: false,
      cachedRouteSignature: undefined,
      lastRoutePacketSentAt: undefined
    })
}));
