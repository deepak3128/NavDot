import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AuthUser = {
  id: string;
  email: string;
  fullName?: string;
};

type AuthState = {
  token?: string;
  user?: AuthUser;
  isReady: boolean;
  setSession: (payload: { token: string; user: AuthUser }) => void;
  clearSession: () => void;
  setReady: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: undefined,
      user: undefined,
      isReady: false,
      setSession: ({ token, user }) => set({ token, user }),
      clearSession: () => set({ token: undefined, user: undefined }),
      setReady: (value) => set({ isReady: value })
    }),
    {
      name: "navdot-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user
      }),
      onRehydrateStorage: () => (state) => {
        state?.setReady(true);
      }
    }
  )
);
