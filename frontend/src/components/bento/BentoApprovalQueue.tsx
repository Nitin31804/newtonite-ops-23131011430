import React, { useState } from 'react';
import { User, WorkItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { ShieldCheck, Check, Sparkles } from 'lucide-react';

interface BentoApprovalQueueProps {
  awaitingItems: WorkItem[];
  onRefresh: () => void;
}

export const BentoApprovalQueue: React.FC<BentoApprovalQueueProps> = ({ awaitingItems, onRefresh }) => {
  const { users, currentUser } = useAuth();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Focus roster: Sarah Connor, Marcus Sterling, Rachel Zane (or fallback leads)
  const roster = [
    {
      id: 'usr-eng-lead',
      name: 'Sarah Connor',
      role: 'Eng Lead',
      avatarRing: 'border-emerald-400',
      gradient: 'from-emerald-400 to-teal-500',
    },
    {
      id: 'usr-pay-lead',
      name: 'Sarah Khamer', // Displayed as in the mockup, mapped to pay lead
      role: 'Payments Lead',
      avatarRing: 'border-amber-400',
      gradient: 'from-amber-400 to-rose-500',
    },
    {
      id: 'usr-cmp-lead',
      name: 'Alian Stulker', // Displayed as in the mockup, mapped to compliance lead
      role: 'Compliance Lead',
      avatarRing: 'border-cyan-400',
      gradient: 'from-cyan-400 to-blue-500',
    },
  ];

  const handleQuickVerify = async (leadName: string) => {
    setVerifyingId(leadName);
    setSuccessNotice(null);

    try {
      if (awaitingItems.length > 0) {
        // Automatically approve the oldest pending approval item
        const target = awaitingItems[0];
        await api.transitionStatus(
          target.id,
          'RESOLVED',
          `1-click fast verification signed by ${leadName}`,
          target.version
        );
        setSuccessNotice(`Approved ${target.id} by ${leadName}`);
        onRefresh();
      } else {
        // Fast sign-off confirmation
        setSuccessNotice(`Standing approval active for ${leadName}`);
      }
    } catch (err: any) {
      console.error('Verify error:', err);
    } finally {
      setTimeout(() => {
        setVerifyingId(null);
      }, 600);
      setTimeout(() => {
        setSuccessNotice(null);
      }, 3500);
    }
  };

  return (
    <div className="bento-card p-6 flex flex-col justify-between relative overflow-hidden h-full group">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-purple-500/5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold tracking-tight text-white font-sans">
          Approval Queue & Team Roster
        </h3>
        {awaitingItems.length > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
            {awaitingItems.length} Pending
          </span>
        )}
      </div>

      {successNotice && (
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-1.5">
          <Check className="w-3.5 h-3.5" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Team Roster with 1-click verify pills */}
      <div className="space-y-3 flex-1 flex flex-col justify-center">
        {roster.map((member) => {
          const isVerifying = verifyingId === member.name;
          return (
            <div
              key={member.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-slate-800/40 transition"
            >
              {/* Avatar & Name */}
              <div className="flex items-center space-x-3">
                <div
                  className={`w-9 h-9 rounded-full bg-gradient-to-tr ${member.gradient} p-[2px] shadow-md`}
                >
                  <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-white">
                    {member.name.charAt(0)}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">{member.name}</h4>
                  <p className="text-[10px] text-slate-400">{member.role}</p>
                </div>
              </div>

              {/* 1-click Verify Pill Button */}
              <button
                onClick={() => handleQuickVerify(member.name)}
                disabled={isVerifying}
                className="px-3 py-1.5 rounded-full glass-pill text-xs font-medium text-slate-300 hover:text-white hover:border-slate-400/50 shadow-sm flex items-center space-x-1.5 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <div className="w-3 h-3 rounded-full border border-cyan-400 border-t-transparent animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span>1-click Verify</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="pt-3 border-t border-slate-800/80 mt-2 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Lead role sign-off verification</span>
        <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
      </div>
    </div>
  );
};
