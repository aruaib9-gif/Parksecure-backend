import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { auth, loadToken, setToken, setOnUnauthorized, loadApiUrl } from '../api/client';

const AuthContext = createContext(null);

export const STAFF_ROLES = ['security', 'facility_admin', 'park_admin', 'super_admin'];
export const ADMIN_ROLES = ['facility_admin', 'park_admin', 'super_admin'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => logout());
    (async () => {
      try {
        // Restore the saved server URL before any request goes out.
        await loadApiUrl();
        const token = await loadToken();
        if (token) setUser(await auth.me());
      } catch {
        // token invalid/expired — start signed out
        await setToken(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [logout]);

  // Best-effort push registration once signed in (no-op in Expo Go / when denied).
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const projectId = undefined; // EAS project id, if configured
        const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        if (tokenData?.data) await auth.savePushToken(tokenData.data, Platform.OS);
      } catch {
        // push unsupported in this environment — fine
      }
    })();
  }, [user?.id]);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await auth.login(email, password);
    await setToken(token);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (data) => {
    const { token, user: u } = await auth.register(data);
    await setToken(token);
    setUser(u);
    return u;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await auth.me());
    } catch {}
  }, []);

  const value = {
    user,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    isStaff: !!user && STAFF_ROLES.includes(user.role),
    isAdmin: !!user && ADMIN_ROLES.includes(user.role),
    isSuperAdmin: user?.role === 'super_admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
