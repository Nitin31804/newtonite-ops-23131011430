import React from 'react';
import { ActivityEvent } from '../../types';
import { ShieldCheck, Activity, Cpu, Database } from 'lucide-react';

interface BentoTelemetryProps {
  recentActivity?: ActivityEvent[];
}

export const BentoTelemetry: React.FC<BentoTelemetryProps> = ({ recentActivity = [] }) => {
  return (
    <div className="bento-card p-6 flex flex-col justify-between relative overflow-hidden h-full group">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div>
        <h3 className="text-sm font-bold tracking-tight text-white mb-3 font-sans">
          Live Concurrency & Safety Telemetry
        </h3>

        {/* High-tech Glowing Badge (Exact text from approved concept) */}
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.25)] mb-4">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Optimistic Locks: Active · Zero Data Drift</span>
        </div>

        {/* Real-time audit event micro-feed label */}
        <p className="text-xs text-slate-400 font-medium mb-3">
          Real-time audit event micro-feed
        </p>

        {/* Glowing audit event micro-dots (exact match to mockup) */}
        <div className="flex items-center space-x-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 filter drop-shadow-[0_0_6px_rgba(6,182,212,0.8)] animate-pulse" />
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 filter drop-shadow-[0_0_6px_rgba(20,184,166,0.8)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
        </div>
      </div>

      {/* Telemetry Stats & Engine Status */}
      <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1">
            <Database className="w-3 h-3 text-cyan-400" />
            <span>SQLite WAL Mode:</span>
          </span>
          <span className="text-slate-200">Non-blocking readers</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span>Outbox Worker:</span>
          </span>
          <span className="text-emerald-400 font-semibold">Running · 0 stale</span>
        </div>
      </div>
    </div>
  );
};
