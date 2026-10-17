import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  switchUser: (userId: string) => void;
  getUserRoleInTeam: (teamId: string) => Role | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_DEMO_MODE = (import.meta as any).env?.VITE_DEMO_MODE === 'true';
const DEMO_PASSWORD = ((import.meta as any).env?.VITE_DEMO_PASSWORD as string) || 'password123';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuth() {
      try {
        let token = localStorage.getItem('newtonite_jwt_token');

        // In demo mode: If no token exists, log in with demo evaluator credentials
        if (!token && IS_DEMO_MODE) {
          try {
            const loginRes = await api.login('eng.lead@newtonite.internal', DEMO_PASSWORD);
            if (loginRes?.token && loginRes?.user) {
              token = loginRes.token;
              localStorage.setItem('newtonite_jwt_token', token);
              localStorage.setItem('newtonite_active_user_id', loginRes.user.id);
            }
          } catch (lErr) {
            console.warn('Initial demo login error:', lErr);
          }
        }

        if (token) {
          try {
            // SINGLE SOURCE OF TRUTH: Derive current user strictly from verified JWT via /api/auth/me
            const meRes = await api.getMe();
            if (meRes?.user) {
              setCurrentUser(meRes.user);
              localStorage.setItem('newtonite_active_user_id', meRes.user.id);
            } else {
              throw new Error('No user payload returned from /api/auth/me');
            }

            // In demo mode, load personas list for evaluator quick-switching
            if (IS_DEMO_MODE) {
              try {
                const loadedPersonas = await api.getPersonas();
                setUsers(loadedPersonas);
              } catch {
                setUsers([meRes.user]);
              }
            } else {
              setUsers([meRes.user]);
            }
          } catch (pErr) {
            console.warn('Failed to verify session token with /api/auth/me:', pErr);
            localStorage.removeItem('newtonite_jwt_token');
            localStorage.removeItem('newtonite_active_user_id');
            setCurrentUser(null);
            setUsers([]);
          }
        } else {
          setCurrentUser(null);
          setUsers([]);
        }
      } catch (err) {
        console.error('Failed to load authentication state:', err);
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadAuth();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.login(email, password);
      if (res?.token && res?.user) {
        localStorage.setItem('newtonite_jwt_token', res.token);
        localStorage.setItem('newtonite_active_user_id', res.user.id);
        setCurrentUser(res.user);
        if (IS_DEMO_MODE) {
          try {
            const loadedPersonas = await api.getPersonas();
            setUsers(loadedPersonas);
          } catch {
            setUsers([res.user]);
          }
        } else {
          setUsers([res.user]);
        }
        return { success: true };
      }
      return { success: false, error: 'Authentication failed: No token received.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Invalid email or password.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('newtonite_jwt_token');
    localStorage.removeItem('newtonite_active_user_id');
    setCurrentUser(null);
    setUsers([]);
  };

  const switchUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target?.email) {
      console.warn('Switch user target email not found');
      return;
    }

    try {
      const loginRes = await api.login(target.email, DEMO_PASSWORD);
      if (loginRes?.token && loginRes?.user) {
        localStorage.setItem('newtonite_jwt_token', loginRes.token);
        localStorage.setItem('newtonite_active_user_id', loginRes.user.id);
        setCurrentUser(loginRes.user);
        window.location.reload();
      } else {
        throw new Error('Failed to acquire token for target persona');
      }
    } catch (e) {
      console.error('Switch user login failed:', e);
      // Strictly do NOT alter active_user_id or trigger reload if login failed!
    }
  };

  const getUserRoleInTeam = (teamId: string): Role | null => {
    if (!currentUser) return null;
    const isAdmin = currentUser.memberships.some((m) => m.role === 'ADMIN');
    if (isAdmin) return 'ADMIN';
    const m = currentUser.memberships.find((mem) => mem.team_id === teamId);
    return m ? m.role : null;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        switchUser,
        getUserRoleInTeam,
        isLoading,
        login,
        logout,
        isAuthenticated: !!currentUser,
        isDemoMode: IS_DEMO_MODE,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
