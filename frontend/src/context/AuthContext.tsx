import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  switchUser: (userId: string) => void;
  getUserRoleInTeam: (teamId: string) => Role | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_DEMO_MODE = (import.meta as any).env?.VITE_DEMO_MODE !== 'false';
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
            if (loginRes?.token) {
              token = loginRes.token;
              localStorage.setItem('newtonite_jwt_token', token);
              localStorage.setItem('newtonite_active_user_id', loginRes.user.id);
            }
          } catch (lErr) {
            console.warn('Initial demo login error:', lErr);
          }
        }

        // Load authorized personas with valid Bearer token
        const loadedPersonas = await api.getPersonas();
        setUsers(loadedPersonas);

        const savedUserId = localStorage.getItem('newtonite_active_user_id') || 'usr-eng-lead';
        const matched = loadedPersonas.find((u) => u.id === savedUserId) || loadedPersonas[0];
        if (matched) {
          setCurrentUser(matched);
          localStorage.setItem('newtonite_active_user_id', matched.id);
        }
      } catch (err) {
        console.error('Failed to load personas:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadAuth();
  }, []);

  const switchUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (target?.email) {
      try {
        const loginRes = await api.login(target.email, DEMO_PASSWORD);
        if (loginRes?.token) {
          localStorage.setItem('newtonite_jwt_token', loginRes.token);
        }
      } catch (e) {
        console.warn('Switch user login failed:', e);
      }
    }
    localStorage.setItem('newtonite_active_user_id', userId);
    window.location.reload();
  };

  const getUserRoleInTeam = (teamId: string): Role | null => {
    if (!currentUser) return null;
    const isAdmin = currentUser.memberships.some((m) => m.role === 'ADMIN');
    if (isAdmin) return 'ADMIN';
    const m = currentUser.memberships.find((mem) => mem.team_id === teamId);
    return m ? m.role : null;
  };

  return (
    <AuthContext.Provider value={{ currentUser, users, switchUser, getUserRoleInTeam, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
