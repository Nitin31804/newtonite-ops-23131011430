import React from 'react';
import { StatsData } from '../types';
import { AlertCircle, Clock, UserCheck, Flame } from 'lucide-react';

interface DashboardStatsProps {
  stats: StatsData | null;
  activeView: string;
  onSelectView: (view: string) => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, activeView, onSelectView }) => {
  const cards = [
    {
      id: 'needs_attention',
      title: 'Needs Attention',
      count: stats ? stats.unassignedUrgent + stats.awaitingApproval : 0,
      description: 'Urgent unassigned & awaiting approval',
      icon: AlertCircle,
      activeColor: 'border-amber-500 bg-amber-50 text-amber-900',
      iconColor: 'text-amber-600',
    },
    {
      id: 'unassigned_urgent',
      title: 'Unassigned Urgent',
      count: stats?.unassignedUrgent || 0,
      description: 'P0 / Urgent triage items needing owners',
      icon: Flame,
      activeColor: 'border-rose-500 bg-rose-50 text-rose-900',
      iconColor: 'text-rose-600',
    },
    {
      id: 'awaiting_approval',
      title: 'Awaiting Approval',
      count: stats?.awaitingApproval || 0,
      description: 'Requires Lead sign-off to resolve',
      icon: Clock,
      activeColor: 'border-blue-500 bg-blue-50 text-blue-900',
      iconColor: 'text-blue-600',
    },
    {
      id: 'assigned_to_me',
      title: 'Assigned to Me',
      count: stats?.assignedToMe || 0,
      description: 'Active items owned by your persona',
      icon: UserCheck,
      activeColor: 'border-emerald-500 bg-emerald-50 text-emerald-900',
      iconColor: 'text-emerald-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeView === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectView(isActive ? '' : card.id)}
            className={`p-4 rounded-xl border text-left transition-all duration-150 shadow-sm hover:shadow ${
              isActive
                ? `${card.activeColor} ring-2 ring-offset-1 ring-slate-400`
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {card.title}
              </span>
              <Icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight">{card.count}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 line-clamp-1">{card.description}</p>
          </button>
        );
      })}
    </div>
  );
};
