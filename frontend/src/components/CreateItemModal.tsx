import React, { useState, useEffect } from 'react';
import { Team, Priority, WorkItemType } from '../types';
import { api, generateIdempotencyKey } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { X, ShieldAlert, Sparkles, Key } from 'lucide-react';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  onCreated: (newItemId: string) => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  teams,
  onCreated,
}) => {
  const { currentUser, getUserRoleInTeam } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<WorkItemType>('incident');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [teamId, setTeamId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form state & generate new idempotency key on open
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setType('incident');
      setPriority('HIGH');
      setTeamId(teams[0]?.id || 'team-eng');
      setIdempotencyKey(generateIdempotencyKey());
      setError(null);
    }
  }, [isOpen, teams]);

  if (!isOpen) return null;

  const currentRole = teamId ? getUserRoleInTeam(teamId) : null;
  const isViewer = currentRole === 'VIEWER';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !teamId) {
      setError('Please fill in all required fields.');
      return;
    }

    if (isViewer) {
      setError('Your role in this team is VIEWER only. Viewers cannot create work items.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const created = await api.createItem(
        {
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          team_id: teamId,
        },
        idempotencyKey // Sent with request to guarantee idempotency!
      );

      onCreated(created.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bento-card max-w-lg w-full bg-slate-900/90 border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Create Operational Work Item</h3>
            <p className="text-xs text-slate-400">
              Assigned team, priority, and initial state tracking
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Idempotency Protection Indicator */}
        <div className="px-6 py-2 bg-cyan-950/40 border-b border-cyan-800/40 flex items-center justify-between text-[11px] text-cyan-300">
          <span className="flex items-center space-x-1.5 font-medium">
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>Protected by Idempotency Key:</span>
          </span>
          <span className="font-mono bg-cyan-900/50 px-2 py-0.5 rounded text-[10px] text-cyan-200 border border-cyan-700/50">
            {idempotencyKey.slice(0, 18)}...
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Team *
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">
                  {t.name}
                </option>
              ))}
            </select>
            {teamId && (
              <span className="text-[11px] text-slate-400 mt-1 block">
                Your role in this team: <strong className="text-cyan-400">{currentRole || 'None (Unauthorized)'}</strong>
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Urgent payment investigation #INV-981"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description *
            </label>
            <textarea
              rows={3}
              placeholder="Provide background, customer impact, error traces, or verification steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WorkItemType)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="incident" className="bg-slate-900">Production Incident</option>
                <option value="customer_issue" className="bg-slate-900">Customer Escalation</option>
                <option value="payment_investigation" className="bg-slate-900">Payment Investigation</option>
                <option value="compliance" className="bg-slate-900">Compliance / Audit</option>
                <option value="operational_task" className="bg-slate-900">Operational Task</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="URGENT" className="bg-slate-900">Urgent (P0)</option>
                <option value="HIGH" className="bg-slate-900">High (P1)</option>
                <option value="MEDIUM" className="bg-slate-900">Medium (P2)</option>
                <option value="LOW" className="bg-slate-900">Low (P3)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isViewer}
              className="px-5 py-2 bg-gradient-to-r from-teal-400 via-cyan-400 to-indigo-400 hover:opacity-95 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Work Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
