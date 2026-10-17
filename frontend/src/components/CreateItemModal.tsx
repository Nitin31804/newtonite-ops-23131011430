import React, { useState, useEffect } from 'react';
import { Team, Priority, WorkItemType } from '../types';
import { api, generateIdempotencyKey } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { X, ShieldAlert } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Create Operational Work Item</h3>
            <p className="text-xs text-slate-500">
              Assigned team, priority, and initial state tracking
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Idempotency Protection Indicator */}
        <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between text-[11px] text-emerald-800">
          <span className="font-medium">Protected by Idempotency Key:</span>
          <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
            {idempotencyKey}
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Team *
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {teamId && (
              <span className="text-[11px] text-slate-500 mt-1 block">
                Your role in this team: <strong>{currentRole || 'None (Unauthorized)'}</strong>
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Urgent payment investigation #INV-981"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description *
            </label>
            <textarea
              rows={3}
              placeholder="Provide background, customer impact, error traces, or verification steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WorkItemType)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="incident">Production Incident</option>
                <option value="customer_issue">Customer Escalation</option>
                <option value="payment_investigation">Payment Investigation</option>
                <option value="compliance">Compliance / Audit</option>
                <option value="operational_task">Operational Task</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="URGENT">Urgent (P0)</option>
                <option value="HIGH">High (P1)</option>
                <option value="MEDIUM">Medium (P2)</option>
                <option value="LOW">Low (P3)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isViewer}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Work Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
