import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { BentoHeroCard } from './components/bento/BentoHeroCard';
import { BentoSlaGauge } from './components/bento/BentoSlaGauge';
import { BentoApprovalQueue } from './components/bento/BentoApprovalQueue';
import { BentoTelemetry } from './components/bento/BentoTelemetry';
import { BentoWorkStreams } from './components/bento/BentoWorkStreams';
import { WorkItemList } from './components/WorkItemList';
import { WorkItemDetail } from './components/WorkItemDetail';
import { CreateItemModal } from './components/CreateItemModal';
import { RaceSimulatorModal } from './components/RaceSimulatorModal';
import { LoginModal } from './components/LoginModal';
import { UserLifecycleModal } from './components/UserLifecycleModal';
import { api } from './api/client';
import { WorkItem, WorkItemDetailData, Team, StatsData } from './types';
import { RefreshCw, LayoutGrid, Terminal } from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { currentUser, isLoading: isAuthLoading } = useAuth();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [awaitingApprovalItems, setAwaitingApprovalItems] = useState<WorkItem[]>([]);
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

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRaceSimulatorOpen, setIsRaceSimulatorOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
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

  // Load awaiting approval items globally across the caller's teams
  const loadAwaitingItems = useCallback(async () => {
    try {
      const res = await api.getItems({ status: 'AWAITING_APPROVAL', limit: 20 });
      setAwaitingApprovalItems(res.items);
    } catch (err) {
      console.warn('Failed to load awaiting approval queue:', err);
    }
  }, []);

  // Load items with current filter parameters (independent of selectedItemId to protect pagination)
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

        // Auto-select first visible item from the result set if previous selection is not in the visible list
        setSelectedItemId((prev) => {
          if (prev && res.items.some((item) => item.id === prev)) {
            return prev;
          }
          return res.items[0]?.id ?? null;
        });

        if (res.items.length === 0) {
          setSelectedItemData(null);
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [teamFilter, statusFilter, priorityFilter, activeView, searchQuery, pagination.limit]
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

  // Load dashboard data when authenticated, or clear state when logged out
  useEffect(() => {
    if (!isAuthLoading && currentUser) {
      loadMeta();
      loadAwaitingItems();
      loadItems(0);
    } else if (!isAuthLoading && !currentUser) {
      setItems([]);
      setAwaitingApprovalItems([]);
      setSelectedItemData(null);
      setSelectedItemId(null);
      setStats(null);
    }
  }, [isAuthLoading, currentUser, loadMeta, loadAwaitingItems, loadItems]);

  // Load detail whenever selectedItemId changes
  useEffect(() => {
    if (selectedItemId) {
      loadItemDetails(selectedItemId);
    }
  }, [selectedItemId, loadItemDetails]);

  // Quick refresh button
  const handleFullRefresh = () => {
    loadMeta();
    loadAwaitingItems();
    loadItems(pagination.offset);
    if (selectedItemId) {
      loadItemDetails(selectedItemId);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070B12] text-slate-300 font-medium">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-sm tracking-wide">Initializing Newtonite Bento Command Center...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#070B12] text-slate-100">
      {/* Floating Island Pill Navbar */}
      <Header
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenRaceSimulator={() => setIsRaceSimulatorOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenRosterModal={() => setIsRosterModalOpen(true)}
      />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 flex-1 flex flex-col space-y-8">
        {/* ========================================================================= */}
        {/* Apple/Stripe-Inspired BENTO GRID COMMAND CENTER (Exact Mockup Match)       */}
        {/* ========================================================================= */}
        <section aria-label="Bento Command Center">
          {/* Top Bento Row: Hero Incident Pipeline + SLA Gauge + Approval Roster */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
            {/* Hero Bento Card (Spans 7 Cols) */}
            <div className="lg:col-span-7">
              <BentoHeroCard
                data={selectedItemData}
                isLoading={isDetailLoading}
                onRefresh={handleFullRefresh}
              />
            </div>

            {/* Right Side Stack: SLA Ring Gauge + Approval Queue (Spans 5 Cols) */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
              <div className="h-full">
                <BentoSlaGauge
                  currentItem={selectedItemData?.item}
                  urgentCount={stats?.unassignedUrgent}
                />
              </div>

              <div className="h-full">
                <BentoApprovalQueue
                  awaitingItems={awaitingApprovalItems}
                  onRefresh={handleFullRefresh}
                />
              </div>
            </div>
          </div>

          {/* Bottom Bento Row: Telemetry + Work Streams Filter Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Live Concurrency & Safety Telemetry (Spans 7 Cols) */}
            <div className="lg:col-span-7">
              <BentoTelemetry recentActivity={selectedItemData?.activity} />
            </div>

            {/* Work Streams Tag Selector (Spans 5 Cols) */}
            <div className="lg:col-span-5">
              <BentoWorkStreams
                priorityFilter={priorityFilter}
                onPriorityChange={(p) => {
                  setPriorityFilter(p);
                  setPagination((prev) => ({ ...prev, offset: 0 }));
                }}
                teamFilter={teamFilter}
                onTeamChange={(t) => {
                  setTeamFilter(t);
                  setPagination((prev) => ({ ...prev, offset: 0 }));
                }}
              />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Operational Incident Stream & Deep Dive Audit Inspector                    */}
        {/* ========================================================================= */}
        <section aria-label="Operational Streams & Inspector" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <LayoutGrid className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Operational Incident Stream & Deep-Dive Inspector
              </h2>
            </div>

            <button
              onClick={handleFullRefresh}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full glass-pill text-xs font-semibold text-slate-300 hover:text-white transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync System</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
        </section>
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

      {/* Race Condition Simulator Modal */}
      <RaceSimulatorModal
        isOpen={isRaceSimulatorOpen}
        onClose={() => setIsRaceSimulatorOpen(false)}
        items={items}
        onRefresh={handleFullRefresh}
      />

      {/* Enterprise Authentication Modal */}
      <LoginModal
        isOpen={isLoginModalOpen || (!isAuthLoading && !currentUser)}
        onClose={() => setIsLoginModalOpen(false)}
        canDismiss={!!currentUser}
      />

      {/* Enterprise Roster & Offboarding Lifecycle Modal */}
      <UserLifecycleModal
        isOpen={isRosterModalOpen}
        onClose={() => setIsRosterModalOpen(false)}
        onRefreshIncidents={handleFullRefresh}
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
