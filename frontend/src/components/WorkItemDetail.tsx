import React, { useState } from 'react';
import { WorkItemDetailData, Priority } from '../types';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  User,
  Shield,
  MessageSquare,
  History,
  Edit2,
  Lock,
} from 'lucide-react';

interface WorkItemDetailProps {
  data: WorkItemDetailData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const WorkItemDetail: React.FC<WorkItemDetailProps> = ({ data, isLoading, onRefresh }) => {
  const { currentUser, getUserRoleInTeam } = useAuth();

  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');

  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        Loading work item details...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        Select a work item from the list to view full details and history.
      </div>
    );
  }

  const { item, activity, comments } = data;
  const userRole = getUserRoleInTeam(item.team_id);
  const isLeadOrAdmin = userRole === 'LEAD' || userRole === 'ADMIN';
  const isMemberOrAbove = isLeadOrAdmin || userRole === 'MEMBER';

  // Handle Atomic Claim
  const handleClaim = async () => {
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

  // Handle Optimistic Update
  const startEdit = () => {
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditPriority(item.priority);
    setIsEditing(true);
    setActionError(null);
    setConflictNotice(null);
  };

  const handleSaveEdit = async () => {
    setActionError(null);
    setConflictNotice(null);
    setIsActionLoading(true);
    try {
      await api.updateItem(item.id, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        version: item.version, // OPTIMISTIC LOCKING: Send current version
      });
      setIsEditing(false);
      onRefresh();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice(err.message);
        setIsEditing(false);
        onRefresh(); // Refresh to latest server state
      } else {
        setActionError(err.message);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Workflow State Transitions
  const handleTransition = async (targetStatus: string, defaultReason?: string) => {
    setActionError(null);
    setConflictNotice(null);

    let reason = defaultReason;
    if (targetStatus === 'AWAITING_APPROVAL' || targetStatus === 'RESOLVED' || targetStatus === 'IN_PROGRESS') {
      const promptText =
        targetStatus === 'RESOLVED'
          ? 'Enter approval resolution notes:'
          : targetStatus === 'AWAITING_APPROVAL'
          ? 'Enter brief reason for review submission:'
          : 'Enter reason:';
      const input = window.prompt(promptText, defaultReason || '');
      if (input === null) return; // User cancelled
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

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, commentText);
      setCommentText('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col space-y-6 p-6">
      {/* Concurrency Conflict Banner (409 Alert) */}
      {conflictNotice && (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-md text-amber-900 flex items-start space-x-3 animate-bounce">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">Concurrency Conflict (409):</span>
            <p className="mt-0.5">{conflictNotice}</p>
            <p className="mt-1 font-semibold text-amber-700">The item has been refreshed with the latest server state.</p>
          </div>
        </div>
      )}

      {/* General Error Banner */}
      {actionError && (
        <div className="p-3 bg-rose-50 border-l-4 border-rose-500 rounded-r-md text-rose-900 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Item Header & Metadata */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
              {item.id}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
              {item.type.replace('_', ' ')}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
              v{item.version}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && isMemberOrAbove && (
              <button
                onClick={startEdit}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {/* Atomic Claim Action */}
            {!item.assignee_id && isMemberOrAbove && (
              <button
                disabled={isActionLoading}
                onClick={handleClaim}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {isActionLoading ? 'Claiming...' : 'Claim This Work Item'}
              </button>
            )}
          </div>
        </div>

        {/* Title & Description View or Edit Form */}
        {isEditing ? (
          <div className="mt-4 space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as Priority)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                disabled={isActionLoading}
                onClick={handleSaveEdit}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-500"
              >
                Save (Version Check)
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <h2 className="text-lg font-bold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50/70 p-3 rounded-lg border border-slate-100">
              {item.description}
            </p>
          </div>
        )}

        {/* Ownership & Context Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Team</span>
            <span className="font-semibold text-slate-800">{item.team_name}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Assignee</span>
            <span className="font-semibold text-slate-800">
              {item.assignee_name || <span className="text-amber-600 italic">Unassigned</span>}
            </span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Priority</span>
            <span className="font-semibold text-slate-800">{item.priority}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Status</span>
            <span className="font-semibold text-slate-800">{item.status}</span>
          </div>
        </div>
      </div>

      {/* Workflow Transition Actions (State Machine Control) */}
      <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center space-x-1.5">
            <Shield className="w-4 h-4 text-indigo-600" />
            <span>Workflow State Machine</span>
          </span>
          <span className="text-[11px] text-slate-500">
            Your role in this team:{' '}
            <strong className="text-slate-800 font-semibold">{userRole || 'None'}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.status === 'OPEN' && (
            <button
              disabled={!isMemberOrAbove || isActionLoading}
              onClick={() => handleTransition('IN_PROGRESS')}
              className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow-sm transition disabled:opacity-40"
            >
              <span>Start Investigation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {item.status === 'IN_PROGRESS' && (
            <button
              disabled={!isMemberOrAbove || isActionLoading}
              onClick={() => handleTransition('AWAITING_APPROVAL')}
              className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold shadow-sm transition disabled:opacity-40"
            >
              <span>Submit for Lead Approval</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {item.status === 'AWAITING_APPROVAL' && (
            <>
              {isLeadOrAdmin ? (
                <div className="flex space-x-2">
                  <button
                    disabled={isActionLoading}
                    onClick={() => handleTransition('RESOLVED')}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-sm transition"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve & Resolve (Lead Gate)</span>
                  </button>
                  <button
                    disabled={isActionLoading}
                    onClick={() => handleTransition('IN_PROGRESS')}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow-sm transition"
                  >
                    <span>Request Changes (Send Back)</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-amber-800 bg-amber-100/70 px-3 py-1.5 rounded-lg border border-amber-200">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Approval Gate: Only a <strong>Team Lead</strong> or <strong>Admin</strong> can approve or reject this work item.
                  </span>
                </div>
              )}
            </>
          )}

          {item.status === 'RESOLVED' && (
            <button
              disabled={!isMemberOrAbove || isActionLoading}
              onClick={() => handleTransition('CLOSED')}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold shadow-sm transition disabled:opacity-40"
            >
              Close Work Item
            </button>
          )}

          {item.status === 'CLOSED' && (
            <div className="text-xs text-slate-500 font-medium italic">
              Work item is closed.
            </div>
          )}
        </div>
      </div>

      {/* Append-Only Audit History Timeline */}
      <div>
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">
          <History className="w-4 h-4 text-slate-500" />
          <span>Append-Only Audit History ({activity.length})</span>
        </div>
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 text-xs">
          {activity.map((evt) => (
            <div key={evt.id} className="flex items-start space-x-2.5 text-slate-600">
              <span className="text-[10px] font-mono text-slate-400 mt-0.5 shrink-0">
                {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div>
                <span className="font-semibold text-slate-800">{evt.actor_name || evt.actor_id}</span>{' '}
                <span className="text-slate-500">[{evt.event_type}]:</span>{' '}
                <span className="text-slate-700">
                  {evt.details?.reason || JSON.stringify(evt.details)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comments Thread */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
          <MessageSquare className="w-4 h-4 text-slate-500" />
          <span>Team Discussion ({comments.length})</span>
        </div>

        <div className="space-y-3 mb-4 max-h-44 overflow-y-auto text-xs">
          {comments.length === 0 ? (
            <p className="text-slate-400 italic">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-800">{c.author_name}</span>
                  <span className="text-slate-400 font-mono">
                    {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-slate-700 text-xs">{c.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleAddComment} className="flex space-x-2">
          <input
            type="text"
            placeholder="Write a comment or investigative finding..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={isSubmittingComment || !commentText.trim()}
            className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"
          >
            {isSubmittingComment ? 'Posting...' : 'Comment'}
          </button>
        </form>
      </div>
    </div>
  );
};
