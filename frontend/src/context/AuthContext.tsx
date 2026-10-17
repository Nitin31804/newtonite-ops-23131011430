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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuth() {
      try {
        const loadedPersonas = await api.getPersonas();
        setUsers(loadedPersonas);

        const savedUserId = localStorage.getItem('newtonite_active_user_id') || 'usr-eng-lead';
        const matched = loadedPersonas.find((u) => u.id === savedUserId) || loadedPersonas[0];
        if (matched) {
          setCurrentUser(matched);
          localStorage.setItem('newtonite_active_user_id', matched.id);
          try {
            const tokenData = await api.getPersonaToken(matched.id);
            if (tokenData?.token) {
              localStorage.setItem('newtonite_jwt_token', tokenData.token);
            }
          } catch (tErr) {
            console.warn('Could not fetch JWT token, falling back to header auth:', tErr);
          }
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
    try {
      const tokenData = await api.getPersonaToken(userId);
      if (tokenData?.token) {
        localStorage.setItem('newtonite_jwt_token', tokenData.token);
      }
    } catch (e) {
      console.warn('Switch user token fetch failed:', e);
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
