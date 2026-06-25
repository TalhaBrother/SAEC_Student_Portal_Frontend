import { create } from "zustand";
import { persist } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      login: (data) =>
        set({
          accessToken: data.access,
          refreshToken: data.refresh,
          user: data.user,
          
        }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
        }),
    }),
    {
      name: "auth-storage",
    }
  )
);

export default useAuthStore;