import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SavedPlace = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
};

type UpsertSavedPlacePayload = {
  id?: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PlacesState = {
  savedPlaces: SavedPlace[];
  upsertSavedPlace: (payload: UpsertSavedPlacePayload) => SavedPlace;
  removeSavedPlace: (id: string) => void;
  clearSavedPlaces: () => void;
};

function makePlaceId(): string {
  return `place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePlacesStore = create<PlacesState>()(
  persist(
    (set, get) => ({
      savedPlaces: [],
      upsertSavedPlace: (payload) => {
        const label = payload.label.trim();
        if (!label) {
          throw new Error("Saved place label is required.");
        }

        const now = new Date().toISOString();
        const nextPlace: SavedPlace = {
          id: payload.id ?? makePlaceId(),
          label,
          latitude: payload.latitude,
          longitude: payload.longitude,
          createdAt: now,
          updatedAt: now
        };

        const existingIndex = get().savedPlaces.findIndex((place) => place.id === nextPlace.id);
        set((state) => {
          const nextPlaces = [...state.savedPlaces];
          if (existingIndex >= 0) {
            const previous = nextPlaces[existingIndex];
            nextPlaces[existingIndex] = {
              ...previous,
              ...nextPlace,
              createdAt: previous.createdAt,
              updatedAt: now
            };
          } else {
            nextPlaces.unshift(nextPlace);
          }

          return { savedPlaces: nextPlaces };
        });

        return nextPlace;
      },
      removeSavedPlace: (id) =>
        set((state) => ({
          savedPlaces: state.savedPlaces.filter((place) => place.id !== id)
        })),
      clearSavedPlaces: () => set({ savedPlaces: [] })
    }),
    {
      name: "navdot-saved-places",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);