import React from 'react';
import { Layers } from 'lucide-react';

interface BentoWorkStreamsProps {
  priorityFilter: string;
  onPriorityChange: (p: string) => void;
  teamFilter: string;
  onTeamChange: (t: string) => void;
}

export const BentoWorkStreams: React.FC<BentoWorkStreamsProps> = ({
  priorityFilter,
  onPriorityChange,
  teamFilter,
  onTeamChange,
}) => {
  return (
    <div className="bento-card p-6 flex flex-col justify-between relative overflow-hidden h-full group">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-indigo-500/5 rounded-3xl pointer-events-none" />

      <div>
        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-tight text-white font-sans">
            Work Streams
          </h3>
          <Layers className="w-4 h-4 text-slate-400" />
        </div>

        {/* Priority Filter Pills (Matches approved mockup exact pills) */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => onPriorityChange(priorityFilter === 'URGENT' ? '' : 'URGENT')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
              priorityFilter === 'URGENT'
                ? 'bg-rose-500/30 text-rose-300 border border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'bg-rose-950/40 text-rose-400 border border-rose-800/40 hover:border-rose-500/50'
            }`}
          >
            Urgent
          </button>

          <button
            onClick={() => onPriorityChange(priorityFilter === 'HIGH' ? '' : 'HIGH')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shadow-sm ${
              priorityFilter === 'HIGH'
                ? 'bg-amber-500/30 text-amber-300 border border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-amber-950/40 text-amber-400 border border-amber-800/40 hover:border-amber-500/50'
            }`}
          >
            High
          </button>
        </div>

        {/* Team Tags (Engineering, Finance) */}
        <div className="mb-4">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">
            Team tags
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onTeamChange(teamFilter === 'team-eng' ? '' : 'team-eng')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                teamFilter === 'team-eng'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-800/60 text-slate-300 border border-slate-700/60 hover:border-slate-500'
              }`}
            >
              Engineering
            </button>

            <button
              onClick={() => onTeamChange(teamFilter === 'team-pay' ? '' : 'team-pay')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                teamFilter === 'team-pay'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/60 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : 'bg-slate-800/60 text-slate-300 border border-slate-700/60 hover:border-slate-500'
              }`}
            >
              Finance
            </button>
          </div>
        </div>

        {/* Version Chips */}
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-800/50 border border-slate-700/50">
            v3
          </span>
        </div>
      </div>

      {/* Clear Active Filters Pill if any active */}
      {(priorityFilter || teamFilter) && (
        <button
          onClick={() => {
            onPriorityChange('');
            onTeamChange('');
          }}
          className="pt-2 text-[10px] font-bold text-cyan-400 hover:underline text-left"
        >
          Reset Stream Filters
        </button>
      )}
    </div>
  );
};
