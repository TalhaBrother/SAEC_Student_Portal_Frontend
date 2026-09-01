import { create } from 'zustand';
import api from '../api/axios';

/**
 * Global Institute Settings store.
 *
 * Backend: institute app is a SINGLETON (`InstituteSettings`, pk always = 1).
 * Endpoint: GET/PATCH  api/institute/settings/   (currently IsAdmin-only on both verbs).
 *
 * Usage:
 *  - Call `fetchSettings()` once near the root of the app (e.g. App.jsx `useEffect`)
 *    for any authenticated area (dashboard, sidebar, admin pages) that needs the
 *    institute name / logo / watermark.
 *  - Settings.jsx calls `setSettings()` directly after a successful save so every
 *    consumer of this store re-renders with fresh data without a refetch.
 *  - NOTE: Because the endpoint is IsAdmin-only, this store will currently fail
 *    to populate on public/unauthenticated screens (e.g. Login.jsx). That needs
 *    a backend decision (public GET vs a separate public endpoint) before this
 *    store can be used there too.
 */
const useInstituteStore = create((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  initialized: false,

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/institute/settings/');
      set({ settings: res.data, loading: false, initialized: true });
      return res.data;
    } catch (error) {
      set({
        error: error.response?.data?.detail || 'Failed to load institute settings',
        loading: false,
        initialized: true,
      });
      throw error;
    }
  },

  // Called after a successful PATCH in Settings.jsx so all consumers update instantly.
  setSettings: (settings) => set({ settings }),

  reset: () => set({ settings: null, loading: false, error: null, initialized: false }),
}));

export default useInstituteStore;