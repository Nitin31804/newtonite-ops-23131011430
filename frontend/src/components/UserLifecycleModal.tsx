import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { User, Role } from '../types';
import {
  Users,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  X,
  AlertTriangle,
  Lock,
  RefreshCw,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

interface UserLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshIncidents?: () => void;
}

export const UserLifecycleModal: React.FC<UserLifecycleModalProps> = ({
  isOpen,
  onClose,
  onRefreshIncidents,
}) => {
  const { currentUser } = useAuth();
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = currentUser?.memberships?.some((m) => m.role === 'ADMIN');

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await api.getUsers();
      setUsersList(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load user roster' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeactivate = async (targetUser: User) => {
    if (!isAdmin) return;
    if (targetUser.id === currentUser?.id) {
      setFeedback({ type: 'error', message: 'Administrators cannot deactivate their own account.' });
      return;
    }

    const confirmDeact = window.confirm(
      `Offboard ${targetUser.name} (${targetUser.email})?\n\nThis will:\n1. Instantly revoke all active 7-day JWT sessions (via token_version bump).\n2. Block future logins with their password.\n3. Automatically unassign their active in-flight incidents.`
    );
    if (!confirmDeact) return;

    try {
      setActionLoadingId(targetUser.id);
      setFeedback(null);
      const res = await api.deactivateUser(targetUser.id, 'Employee offboarding');
      setFeedback({
        type: 'success',
        message: `${res.message} (${res.unassignedWorkItems} incident(s) reclaimed to triage queue).`,
      });
      await fetchUsers();
      if (onRefreshIncidents) onRefreshIncidents();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to deactivate user' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (targetUser: User) => {
    if (!isAdmin) return;
    try {
      setActionLoadingId(targetUser.id);
      setFeedback(null);
      const res = await api.reactivateUser(targetUser.id);
      setFeedback({ type: 'success', message: res.message });
      await fetchUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to reactivate user' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'LEAD':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
      case 'MEMBER':
        return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
      case 'VIEWER':
        return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bento-card p-6 border border-slate-700/80 shadow-2xl rounded-3xl bg-slate-900/95 max-h-[90vh] flex flex-col">
        {/* Ambient Gradient Glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-rose-500/20 via-purple-500/20 to-cyan-500/20 rounded-3xl blur-xl pointer-events-none -z-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Enterprise Roster & Offboarding Security</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Lifecycle Defense
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Manage operator account activation and enforce instant cryptographic token revocation upon resignation.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Defense Card */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-800/40 border border-slate-700/60 flex items-start space-x-3 text-xs text-slate-300">
          <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200">Stateless Token Revocation Protocol:</span> Deactivating an operator immediately bumps their <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">token_version</code>, invalidating all pre-existing 7-day JWT tokens in the wild and unassigning pending incidents back to the triage pool.
          </div>
        </div>

        {/* Feedback Alerts */}
        {feedback && (
          <div
            className={`mt-3 p-3 rounded-xl border flex items-center space-x-2 text-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="flex-1">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Users Table */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
              <span>Loading enterprise roster...</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {usersList.map((user) => {
                const isActive = user.is_active !== false;
                const isCurrent = user.id === currentUser?.id;
                const userRole = user.memberships?.[0]?.role || 'MEMBER';

                return (
                  <div
                    key={user.id}
                    className={`py-3.5 px-3 flex items-center justify-between rounded-xl transition ${
                      isActive ? 'hover:bg-slate-800/40' : 'bg-rose-950/10 border border-rose-900/20'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                          isActive
                            ? 'bg-gradient-to-tr from-cyan-400 to-purple-500 text-slate-950'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {user.name.charAt(0)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-slate-400 line-through'}`}>
                            {user.name}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              YOU
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getRoleBadge(userRole)}`}>
                            {userRole}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                          <span className="truncate">{user.email}</span>
                          <span>•</span>
                          <span className="truncate text-slate-500">
                            {user.memberships?.map((m) => m.team_name || m.team_id).join(', ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      {/* Status Pill */}
                      {isActive ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <UserX className="w-3 h-3" />
                          <span>Deactivated</span>
                        </span>
                      )}

                      {/* Admin Controls */}
                      {isAdmin && (
                        <div>
                          {isActive ? (
                            <button
                              onClick={() => handleDeactivate(user)}
                              disabled={isCurrent || actionLoadingId === user.id}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${
                                isCurrent
                                  ? 'opacity-30 cursor-not-allowed border-slate-700 text-slate-500'
                                  : 'bg-rose-500/10 hover:bg-rose-500/25 border-rose-500/30 text-rose-300 hover:text-white shadow-sm'
                              }`}
                              title={isCurrent ? 'Cannot deactivate yourself' : 'Offboard user and revoke active sessions'}
                            >
                              {actionLoadingId === user.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" />
                              )}
                              <span>Deactivate</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(user)}
                              disabled={actionLoadingId === user.id}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-white transition flex items-center space-x-1.5 shadow-sm"
                            >
                              {actionLoadingId === user.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                              <span>Reactivate</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>
            Logged in as <span className="font-semibold text-slate-300">{currentUser?.name}</span> ({isAdmin ? 'Global Administrator' : 'Operator'})
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
