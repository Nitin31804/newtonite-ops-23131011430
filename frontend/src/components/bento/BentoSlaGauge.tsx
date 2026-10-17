import React from 'react';
import { WorkItem } from '../../types';
import { Clock, ShieldAlert } from 'lucide-react';

interface BentoSlaGaugeProps {
  currentItem?: WorkItem | null;
  urgentCount?: number;
}

export const BentoSlaGauge: React.FC<BentoSlaGaugeProps> = ({ currentItem, urgentCount = 0 }) => {
  // Calculate remaining minutes from created_at SLA threshold
  let displayMinutes = 42;
  let isOverdue = false;

  if (currentItem?.created_at) {
    const targetDurationMs = currentItem.priority === 'URGENT' ? 4 * 3600 * 1000 : 24 * 3600 * 1000;
    const expiryTime = new Date(currentItem.created_at).getTime() + targetDurationMs;
    const diffMs = expiryTime - Date.now();
    const mins = Math.round(diffMs / 60000);
    if (mins < 0) {
      isOverdue = true;
      displayMinutes = Math.abs(mins);
    } else {
      displayMinutes = Math.min(mins, 240); // Cap within window
    }
  }

  // Radial calculation (radius 68, circumference ~ 427)
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  // Let's make the progress ring cover ~75% of the circle like in the mockup
  const strokeDashoffset = circumference * 0.28;

  return (
    <div className="bento-card p-6 flex flex-col justify-between items-center relative overflow-hidden h-full group">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          SLA ring progress
        </span>
        <span className="flex items-center space-x-1 text-[10px] text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-800/40">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>P0 SLA</span>
        </span>
      </div>

      {/* Circular Radial Gauge */}
      <div className="relative flex items-center justify-center my-3">
        <svg
          width="180"
          height="180"
          viewBox="0 0 180 180"
          className="transform -rotate-90 filter drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
        >
          <defs>
            <linearGradient id="sla-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
            <linearGradient id="sla-track" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* Background Track Circle */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            stroke="url(#sla-track)"
            strokeWidth="12"
            fill="none"
            strokeOpacity="0.8"
          />

          {/* Active Gradient Glowing Progress Ring */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            stroke="url(#sla-gradient)"
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Label (Matches mockup exact layout) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-3xl font-extrabold tracking-tight text-white font-sans">
            {displayMinutes}m
          </span>
          <span className="text-xs font-medium text-slate-400 -mt-0.5">
            {isOverdue ? 'breached' : 'remaining'}
          </span>
        </div>
      </div>

      {/* Footer Info Pill */}
      <div className="w-full pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>4h Target SLA</span>
        </span>
        <span className="text-emerald-400 font-semibold text-[11px]">
          94% On Track
        </span>
      </div>
    </div>
  );
};
