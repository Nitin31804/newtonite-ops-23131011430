import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { DashboardStats } from './components/DashboardStats';
import { WorkItemList } from './components/WorkItemList';
import { WorkItemDetail } from './components/WorkItemDetail';
import { CreateItemModal } from './components/CreateItemModal';
import { api } from './api/client';
import { WorkItem, WorkItemDetailData, Team, StatsData } from './types';
import { RefreshCw } from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { currentUser, isLoading: isAuthLoading } = useAuth();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 15, offset: 0, hasMore: false });

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemData, setSelectedItemData] = useState<WorkItemDetailData | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Filter States
  const [activeView, setActiveView] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load teams and stats
  const loadMeta = useCallback(async () => {
    try {
      const [teamsData, statsData] = await Promise.all([api.getTeams(), api.getStats()]);
      setTeams(teamsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load meta:', err);
    }
  }, []);

  // Load items with current filter parameters
  const loadItems = useCallback(
    async (offset = 0) => {
      try {
        setIsRefreshing(true);
        const res = await api.getItems({
          teamId: teamFilter || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          view: activeView || undefined,
          q: searchQuery || undefined,
          limit: pagination.limit,
          offset,
        });

        setItems(res.items);
        setPagination(res.pagination);

        // Auto-select first item if none selected
        if (!selectedItemId && res.items.length > 0) {
          setSelectedItemId(res.items[0].id);
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [teamFilter, statusFilter, priorityFilter, activeView, searchQuery, pagination.limit, selectedItemId]
  );

  // Load item details
  const loadItemDetails = useCallback(async (id: string) => {
    setIsDetailLoading(true);
    try {
      const data = await api.getItemDetails(id);
      setSelectedItemData(data);
    } catch (err) {
      console.error('Failed to load item details:', err);
      setSelectedItemData(null);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!isAuthLoading) {
      loadMeta();
      loadItems(0);
    }
  }, [isAuthLoading, loadMeta, loadItems]);

  // Load detail whenever selectedItemId changes
  useEffect(() => {
    if (selectedItemId) {
      loadItemDetails(selectedItemId);
    }
  }, [selectedItemId, loadItemDetails]);

  // Quick refresh button
  const handleFullRefresh = () => {
    loadMeta();
    loadItems(pagination.offset);
    if (selectedItemId) {
      loadItemDetails(selectedItemId);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-medium">
        Loading Newtonite Operations System...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Header onOpenCreateModal={() => setIsCreateModalOpen(true)} />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        {/* Top Operational Bar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Operational Command Center
            </h1>
            <p className="text-xs text-slate-500">
              Reliable cross-team operational workflows under concurrency
            </p>
          </div>

          <button
            onClick={handleFullRefresh}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Dashboard 4-card operational triage view */}
        <DashboardStats
          stats={stats}
          activeView={activeView}
          onSelectView={(view) => {
            setActiveView(view);
            setPagination((p) => ({ ...p, offset: 0 }));
          }}
        />

        {/* Two-Pane Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Left Column: Work Item List */}
          <div className="lg:col-span-5 h-full">
            <WorkItemList
              items={items}
              teams={teams}
              selectedItemId={selectedItemId}
              onSelectItem={(id) => setSelectedItemId(id)}
              activeView={activeView}
              onClearView={() => setActiveView('')}
              teamFilter={teamFilter}
              onTeamFilterChange={(t) => {
                setTeamFilter(t);
                setPagination((p) => ({ ...p, offset: 0 }));
              }}
              statusFilter={statusFilter}
              onStatusFilterChange={(s) => {
                setStatusFilter(s);
                setPagination((p) => ({ ...p, offset: 0 }));
              }}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={(p) => {
                setPriorityFilter(p);
                setPagination((prev) => ({ ...prev, offset: 0 }));
              }}
              searchQuery={searchQuery}
              onSearchChange={(q) => {
                setSearchQuery(q);
                setPagination((prev) => ({ ...prev, offset: 0 }));
              }}
              pagination={pagination}
              onPageChange={(offset) => loadItems(offset)}
            />
          </div>

          {/* Right Column: Work Item Detail, Concurrency Controls, Workflow Engine */}
          <div className="lg:col-span-7 h-full">
            <WorkItemDetail
              data={selectedItemData}
              isLoading={isDetailLoading}
              onRefresh={handleFullRefresh}
            />
          </div>
        </div>
      </main>

      {/* Create Modal */}
      <CreateItemModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        teams={teams}
        onCreated={(newId) => {
          handleFullRefresh();
          setSelectedItemId(newId);
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
