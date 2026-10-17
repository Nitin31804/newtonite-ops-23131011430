import React from 'react';
import { WorkItem, Team } from '../types';
import { Search, Filter, AlertCircle, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

interface WorkItemListProps {
  items: WorkItem[];
  teams: Team[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  activeView: string;
  onClearView: () => void;
  teamFilter: string;
  onTeamFilterChange: (t: string) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (p: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  onPageChange: (offset: number) => void;
}

export const WorkItemList: React.FC<WorkItemListProps> = ({
  items,
  teams,
  selectedItemId,
  onSelectItem,
  activeView,
  onClearView,
  teamFilter,
  onTeamFilterChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  searchQuery,
  onSearchChange,
  pagination,
  onPageChange,
}) => {
  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">URGENT</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">LOW</span>;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">IN PROGRESS</span>;
      case 'AWAITING_APPROVAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 animate-pulse">AWAITING APPROVAL</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">CLOSED</span>;
      default:
        return <span>{s}</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Search & Filter Header */}
      <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by title, description..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={teamFilter}
            onChange={(e) => onTeamFilterChange(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="AWAITING_APPROVAL">Awaiting Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {activeView && (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-medium">
              <span>View: {activeView.replace('_', ' ')}</span>
              <button onClick={onClearView} className="hover:text-rose-600 font-bold ml-1">
                ×
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Item List Rows */}
      <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[600px]">
        {items.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No work items match the current filters.
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedItemId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className={`w-full text-left p-3.5 transition duration-150 flex flex-col space-y-1.5 hover:bg-slate-50 ${
                  isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 line-clamp-1">
                    {item.title}
                  </span>
                  <div className="flex items-center space-x-1 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                      v{item.version}
                    </span>
                    {getPriorityBadge(item.priority)}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-700">{item.team_name}</span>
                    <span>•</span>
                    <span>{getStatusBadge(item.status)}</span>
                  </div>
                  <div>
                    {item.assignee_name ? (
                      <span className="text-slate-600 font-medium">👤 {item.assignee_name}</span>
                    ) : (
                      <span className="text-amber-600 font-semibold italic">Unassigned</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
        <span>
          Showing {items.length > 0 ? pagination.offset + 1 : 0} to{' '}
          {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} items
        </span>
        <div className="flex space-x-1">
          <button
            disabled={pagination.offset === 0}
            onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Previous
          </button>
          <button
            disabled={!pagination.hasMore}
            onClick={() => onPageChange(pagination.offset + pagination.limit)}
            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
