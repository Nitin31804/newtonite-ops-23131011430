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
    async function loadUsers() {
      try {
        const loadedUsers = await api.getUsers();
        setUsers(loadedUsers);

        const savedUserId = localStorage.getItem('newtonite_active_user_id');
        const matched = loadedUsers.find((u) => u.id === savedUserId) || loadedUsers[1] || loadedUsers[0];
        if (matched) {
          setCurrentUser(matched);
          localStorage.setItem('newtonite_active_user_id', matched.id);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, []);

  const switchUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('newtonite_active_user_id', user.id);
      window.location.reload(); // Refresh to reload data under new credentials
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
