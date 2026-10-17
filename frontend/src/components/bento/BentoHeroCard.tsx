import React, { useState } from 'react';
import { WorkItemDetailData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../api/client';
import {
  Lock,
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface BentoHeroCardProps {
  data: WorkItemDetailData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const BentoHeroCard: React.FC<BentoHeroCardProps> = ({ data, isLoading, onRefresh }) => {
  const { currentUser, getUserRoleInTeam } = useAuth();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bento-card p-8 flex flex-col justify-center items-center min-h-[380px] text-slate-400">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-3" />
        <span className="text-xs font-medium">Synchronizing incident pipeline...</span>
      </div>
    );
  }

  const item = data?.item;
  const userRole = item ? getUserRoleInTeam(item.team_id) : null;
  const isLeadOrAdmin = userRole === 'LEAD' || userRole === 'ADMIN';
  const isMemberOrAbove = isLeadOrAdmin || userRole === 'MEMBER';

  // Fallback display if no item is loaded yet
  const title = item ? item.title : 'P0 Incident: Kafka Consumer Lag Spike';
  const priority = item ? item.priority : 'URGENT';
  const status = item ? item.status : 'IN_PROGRESS';
  const isAssignedToMe = item && currentUser && item.assignee_id === currentUser.id;
  const isUnassigned = item && !item.assignee_id;

  // Handle Atomic Claim
  const handleClaim = async () => {
    if (!item) return;
    setActionError(null);
    setConflictNotice(null);
    setIsActionLoading(true);
    try {
      await api.claimItem(item.id);
      onRefresh();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice(err.message);
        onRefresh();
      } else {
        setActionError(err.message);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Lead Approval or Workflow Transition
  const handleTransition = async (targetStatus: string, defaultReason?: string) => {
    if (!item) return;
    setActionError(null);
    setConflictNotice(null);

    let reason = defaultReason;
    if (targetStatus === 'RESOLVED') {
      const input = window.prompt('Enter approval sign-off note (Lead Gate):', 'Verified metrics normalized in Datadog.');
      if (input === null) return;
      reason = input.trim();
    } else if (targetStatus === 'AWAITING_APPROVAL') {
      const input = window.prompt('Enter reason for Lead review submission:', 'Patch deployed to staging, consumer lag dropped to 0.');
      if (input === null) return;
      reason = input.trim();
    }

    setIsActionLoading(true);
    try {
      await api.transitionStatus(item.id, targetStatus, reason, item.version);
      onRefresh();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice(err.message);
        onRefresh();
      } else {
        setActionError(err.message);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Pipeline stage active checks
  const isOpen = status === 'OPEN';
  const isInProgress = status === 'IN_PROGRESS';
  const isAwaitingApproval = status === 'AWAITING_APPROVAL';
  const isResolved = status === 'RESOLVED' || status === 'CLOSED';

  return (
    <div className="bento-card p-6 sm:p-7 flex flex-col justify-between relative overflow-hidden h-full group">
      {/* Background neon atmospheric ambient glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      <div>
        {/* Top Tag & Item Title */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Hero Bento Card
            </span>
            {item && (
              <span className="text-[10px] font-mono text-cyan-400/80 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
                {item.id} · v{item.version}
              </span>
            )}
          </div>

          {item?.assignee_name ? (
            <div className="flex items-center space-x-1.5 text-xs text-slate-300">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Owner: <strong className="text-white">{item.assignee_name}</strong></span>
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
              UNCLAIMED
            </span>
          )}
        </div>

        {/* Hero Title with Priority Glow */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1">
          <span className="text-rose-400 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.6)] mr-2">
            {priority === 'URGENT' ? 'P0 Incident:' : priority === 'HIGH' ? 'P1 Urgent:' : 'Work Stream:'}
          </span>
          <span>{title}</span>
        </h2>
        <p className="text-xs text-slate-400 mb-6 font-medium">
          Neon workflow pipeline stages with server-enforced Lead approval gate
        </p>

        {/* Conflict / Error Banner */}
        {conflictNotice && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{conflictNotice}</span>
            </div>
            <button
              onClick={onRefresh}
              className="text-[10px] font-bold uppercase underline hover:text-white"
            >
              Reload
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* SVG Illuminated Curved Workflow Pipeline */}
        <div className="relative py-4 my-2 select-none">
          <svg
            viewBox="0 0 600 210"
            className="w-full h-auto overflow-visible filter drop-shadow-[0_0_12px_rgba(6,182,212,0.35)]"
          >
            <defs>
              {/* Connector Gradient 1: Open to In Progress */}
              <linearGradient id="curveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>

              {/* Connector Gradient 2: In Progress to Lead Review */}
              <linearGradient id="curveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>

              {/* Connector Gradient 3: Lead Review to Resolved Top */}
              <linearGradient id="curveGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>

              {/* Connector Gradient 4: Lead Review to Resolved Bottom */}
              <linearGradient id="curveGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>

              {/* Node Glow Filters */}
              <filter id="glow-magenta" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Path 1: Open (60, 60) -> In Progress (180, 140) */}
            <path
              d="M 60 60 C 130 60, 110 140, 180 140"
              fill="none"
              stroke="url(#curveGrad1)"
              strokeWidth={isInProgress || isAwaitingApproval || isResolved ? '4' : '2'}
              strokeOpacity={isInProgress || isAwaitingApproval || isResolved ? '1' : '0.4'}
              className={isInProgress ? 'animate-pipeline-flow' : ''}
            />

            {/* Path 2: In Progress (180, 140) -> Lead Review (310, 140) */}
            <path
              d="M 180 140 L 310 140"
              fill="none"
              stroke="url(#curveGrad2)"
              strokeWidth={isAwaitingApproval || isResolved ? '4' : '2'}
              strokeOpacity={isAwaitingApproval || isResolved ? '1' : '0.35'}
              className={isAwaitingApproval ? 'animate-pipeline-flow' : ''}
            />

            {/* Path 3: Lead Review (310, 140) -> Upper Resolved (440, 65) */}
            <path
              d="M 310 140 C 360 140, 370 65, 440 65"
              fill="none"
              stroke="url(#curveGrad3)"
              strokeWidth={isResolved ? '4' : '2'}
              strokeOpacity={isResolved ? '1' : '0.3'}
              className={isResolved ? 'animate-pipeline-flow' : ''}
            />

            {/* Path 4: Lead Review (310, 140) -> Lower Resolved Pill (440, 185) */}
            <path
              d="M 310 140 C 370 140, 380 185, 440 185"
              fill="none"
              stroke="url(#curveGrad4)"
              strokeWidth="2"
              strokeOpacity={isResolved ? '0.9' : '0.35'}
            />

            {/* Node 1: [Open] at (60, 60) */}
            <g transform="translate(60, 60)" className="cursor-pointer">
              <circle
                r="18"
                fill="#1e1026"
                stroke="#ec4899"
                strokeWidth={isOpen ? '3.5' : '2'}
                filter={isOpen ? 'url(#glow-magenta)' : undefined}
              />
              <circle r="6" fill="#f472b6" />
              <text
                x="0"
                y="35"
                textAnchor="middle"
                fill="#f472b6"
                fontSize="12"
                fontWeight="700"
                letterSpacing="0.5"
              >
                [Open]
              </text>
            </g>

            {/* Node 2: [In Progress] at (180, 140) */}
            <g transform="translate(180, 140)" className="cursor-pointer">
              <circle
                r="20"
                fill="#083344"
                stroke="#06b6d4"
                strokeWidth={isInProgress ? '3.5' : '2'}
                filter={isInProgress ? 'url(#glow-cyan)' : undefined}
              />
              {/* Arrow Right Icon inside */}
              <path
                d="M -5 -6 L 5 0 L -5 6"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x="0"
                y="38"
                textAnchor="middle"
                fill="#22d3ee"
                fontSize="12"
                fontWeight="700"
                letterSpacing="0.5"
              >
                [In Progress]
              </text>
            </g>

            {/* Node 3: [Lead Review] Gate at (310, 140) */}
            <g transform="translate(310, 140)" className="cursor-pointer">
              <circle
                r="20"
                fill="#2e1065"
                stroke="#a855f7"
                strokeWidth={isAwaitingApproval ? '3.5' : '2'}
                filter={isAwaitingApproval ? 'url(#glow-purple)' : undefined}
              />
              {/* Lock Icon inside */}
              <path
                d="M -4 -1 L -4 -4 C -4 -6.5, 4 -6.5, 4 -4 L 4 -1 M -6 -1 L 6 -1 L 6 6 L -6 6 Z"
                fill="#c084fc"
                stroke="#c084fc"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <text
                x="0"
                y="38"
                textAnchor="middle"
                fill="#c084fc"
                fontSize="11"
                fontWeight="700"
                letterSpacing="0.5"
              >
                [Lead Review]
              </text>
            </g>

            {/* Node 4 Upper: [Resolved Check] at (440, 65) */}
            <g transform="translate(440, 65)" className="cursor-pointer">
              <circle
                r="18"
                fill="#064e3b"
                stroke="#10b981"
                strokeWidth={isResolved ? '3.5' : '2'}
                filter={isResolved ? 'url(#glow-emerald)' : undefined}
              />
              {/* Checkmark inside */}
              <path
                d="M -5 0 L -1 4 L 6 -3"
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x="0"
                y="33"
                textAnchor="middle"
                fill="#34d399"
                fontSize="12"
                fontWeight="700"
                letterSpacing="0.5"
              >
                [Resolved]
              </text>
            </g>

            {/* Node 4 Lower: Glass Pill [Resolved Status] at (440, 185) */}
            <g transform="translate(440, 185)">
              <rect
                x="-55"
                y="-18"
                width="110"
                height="36"
                rx="18"
                fill="rgba(15, 23, 42, 0.85)"
                stroke="#38bdf8"
                strokeWidth="1.5"
                filter="url(#glow-cyan)"
              />
              <circle cx="-32" cy="0" r="4" fill="#38bdf8" />
              <text
                x="6"
                y="5"
                textAnchor="middle"
                fill="#38bdf8"
                fontSize="12"
                fontWeight="bold"
                letterSpacing="0.5"
              >
                Resolved
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Action Buttons: Claim Task & Approve Resolution */}
      <div className="pt-4 border-t border-slate-800/80 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Claim Task Action */}
        {isUnassigned ? (
          <button
            onClick={handleClaim}
            disabled={isActionLoading}
            className="w-full py-3 px-4 rounded-xl glass-pill font-bold text-sm text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 shadow-lg shadow-cyan-500/10 flex items-center justify-center space-x-2 transition-all transform hover:-translate-y-0.5"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{isActionLoading ? 'Claiming Atomically...' : 'Claim Task'}</span>
          </button>
        ) : (
          <div className="w-full py-3 px-4 rounded-xl glass-pill font-semibold text-xs text-slate-300 flex items-center justify-center space-x-2 border border-slate-700/60">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {isAssignedToMe ? 'Claimed by you' : `Claimed by ${item?.assignee_name || 'Operator'}`}
            </span>
          </div>
        )}

        {/* Workflow Approval Action (Lead Gate) */}
        {isAwaitingApproval ? (
          <button
            onClick={() => handleTransition('RESOLVED')}
            disabled={isActionLoading || !isLeadOrAdmin}
            className="w-full py-3 px-4 rounded-xl glass-pill font-bold text-sm text-emerald-300 hover:text-white border border-emerald-500/40 hover:border-emerald-400/80 shadow-lg shadow-emerald-500/15 flex items-center justify-center space-x-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
            title={isLeadOrAdmin ? '1-Click Lead Sign-Off' : 'Requires Lead role'}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isActionLoading ? 'Verifying...' : 'Approve Resolution'}</span>
          </button>
        ) : isInProgress ? (
          <button
            onClick={() => handleTransition('AWAITING_APPROVAL')}
            disabled={isActionLoading || (!isAssignedToMe && !isLeadOrAdmin)}
            className="w-full py-3 px-4 rounded-xl glass-pill font-bold text-sm text-purple-300 hover:text-white border border-purple-500/30 hover:border-purple-400/60 shadow-lg shadow-purple-500/10 flex items-center justify-center space-x-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            <Lock className="w-4 h-4 text-purple-400" />
            <span>Submit for Lead Review</span>
          </button>
        ) : isOpen ? (
          <button
            onClick={() => handleTransition('IN_PROGRESS')}
            disabled={isActionLoading}
            className="w-full py-3 px-4 rounded-xl glass-pill font-bold text-sm text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 flex items-center justify-center space-x-2 transition-all"
          >
            <ArrowRight className="w-4 h-4 text-cyan-400" />
            <span>Start Working</span>
          </button>
        ) : (
          <div className="w-full py-3 px-4 rounded-xl glass-pill font-semibold text-xs text-emerald-400 flex items-center justify-center space-x-2 border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Resolved & Verified</span>
          </div>
        )}
      </div>
    </div>
  );
};
