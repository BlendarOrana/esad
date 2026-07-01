import { create } from "zustand";
import axiosInstance from "../lib/axios";

export const useAuthStore = create((set) => ({
  admin: null,
  isCheckingAuth: true,
  isLoggingIn: false,
  isRegistering: false,
  isLoggingOut: false,

  // Called once on app load (see App.jsx) to check the accessToken cookie
  getMe: async () => {
    set({ isCheckingAuth: true });
    try {
      const res = await axiosInstance.get("/auth/me");
      set({ admin: res.data });
    } catch (error) {
      set({ admin: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  login: async ({ name, password }) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", { name, password });
      set({ admin: res.data });
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || "Login failed";
      return { success: false, error: message };
    } finally {
      set({ isLoggingIn: false });
    }
  },

  // Requires an existing session — see note on the /auth/register route
  register: async ({ name, password }) => {
    set({ isRegistering: true });
    try {
      const res = await axiosInstance.post("/auth/register", { name, password });
      return { success: true, data: res.data };
    } catch (error) {
      const message = error.response?.data?.message || "Registration failed";
      return { success: false, error: message };
    } finally {
      set({ isRegistering: false });
    }
  },

  logout: async () => {
    set({ isLoggingOut: true });
    try {
      await axiosInstance.post("/auth/logout");
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      // Clear local state regardless, so the UI never gets stuck logged-in
      set({ admin: null, isLoggingOut: false });
    }
  },
}));