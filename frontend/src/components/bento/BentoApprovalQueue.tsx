import React, { useState } from 'react';
import { WorkItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { ShieldCheck, Check, Sparkles, Lock, CheckCircle2 } from 'lucide-react';

interface BentoApprovalQueueProps {
  awaitingItems: WorkItem[];
  onRefresh: () => void;
}

export const BentoApprovalQueue: React.FC<BentoApprovalQueueProps> = ({ awaitingItems, onRefresh }) => {
  const { currentUser, getUserRoleInTeam } = useAuth();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApprove = async (item: WorkItem) => {
    if (!currentUser) return;
    setApprovingId(item.id);
    setSuccessNotice(null);
    setErrorMessage(null);

    const userRole = getUserRoleInTeam(item.team_id);
    if (userRole !== 'LEAD' && userRole !== 'ADMIN') {
      setErrorMessage(`Permission denied: Your role in ${item.team_id} is ${userRole || 'NON-MEMBER'}. Requires LEAD or ADMIN.`);
      setApprovingId(null);
      return;
    }

    try {
      await api.transitionStatus(
        item.id,
        'RESOLVED',
        `Verified and approved by ${currentUser.name} (${userRole})`,
        item.version
      );
      setSuccessNotice(`Successfully approved ${item.id} as ${currentUser.name}`);
      onRefresh();
    } catch (err: any) {
      console.error('Approval failed:', err);
      setErrorMessage(err?.message || 'Failed to approve item');
    } finally {
      setApprovingId(null);
      setTimeout(() => setSuccessNotice(null), 4000);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  return (
    <div className="bento-card p-6 flex flex-col justify-between relative overflow-hidden h-full group">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-purple-500/5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold tracking-tight text-white font-sans">
            Lead Approval Queue
          </h3>
        </div>
        {awaitingItems.length > 0 ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
            {awaitingItems.length} Pending
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            All Clear
          </span>
        )}
      </div>

      {successNotice && (
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-1.5">
          <Check className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{successNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-1.5">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-2.5 flex-1 flex flex-col justify-center">
        {awaitingItems.length === 0 ? (
          <div className="py-6 px-4 text-center rounded-2xl bg-slate-800/30 border border-slate-700/40 flex flex-col items-center justify-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
            <p className="text-xs font-semibold text-slate-300">
              Zero Items Awaiting Sign-off
            </p>
            <p className="text-[11px] text-slate-500 max-w-[220px]">
              When an engineer moves an incident to review, it will appear here for lead verification.
            </p>
          </div>
        ) : (
          awaitingItems.slice(0, 3).map((item) => {
            const userRole = getUserRoleInTeam(item.team_id);
            const canApprove = userRole === 'LEAD' || userRole === 'ADMIN';
            const isApproving = approvingId === item.id;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition"
              >
                {/* Item Details */}
                <div className="min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-[10px] text-purple-300 font-bold">{item.id}</span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700/60">
                      {item.team_id.replace('team-', '')}
                    </span>
                  </div>
                  <h4 className="text-xs font-medium text-slate-200 truncate max-w-[170px]" title={item.title}>
                    {item.title}
                  </h4>
                </div>

                {/* Dynamic Approval Button with Authentic Attribution */}
                {canApprove ? (
                  <button
                    onClick={() => handleApprove(item)}
                    disabled={isApproving}
                    className="px-2.5 py-1.5 rounded-full glass-pill text-xs font-semibold text-emerald-300 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/40 shadow-sm flex items-center space-x-1 transition-all disabled:opacity-50 flex-shrink-0"
                    title={`Approve as ${currentUser?.name}`}
                  >
                    {isApproving ? (
                      <>
                        <div className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                        <span className="text-[10px]">Signing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px]">Approve</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span
                    className="px-2 py-1 rounded-full text-[10px] font-medium text-slate-500 bg-slate-800/80 border border-slate-700 flex items-center space-x-1 flex-shrink-0"
                    title={`Requires LEAD or ADMIN (Current role: ${userRole || 'Viewer/None'})`}
                  >
                    <Lock className="w-3 h-3 text-slate-500" />
                    <span>Lead Only</span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Authentic Signer Attribution */}
      <div className="pt-3 border-t border-slate-800/80 mt-2 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="truncate">
          Signer: <span className="text-slate-200 font-semibold">{currentUser?.name || 'Unauthenticated'}</span>
        </span>
        <span className="text-[10px] text-purple-400 font-mono">RBAC Enforced</span>
      </div>
    </div>
  );
};
