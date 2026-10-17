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
      <div className="bento-card p-12 text-center text-slate-400 flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-3" />
        <span className="text-xs">Loading incident details...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bento-card p-12 text-center text-slate-500 text-xs">
        Select an incident from the stream to inspect details, comments, and audit trail.
      </div>
    );
  }

  const { item, activity, comments } = data;
  const userRole = getUserRoleInTeam(item.team_id);
  const isLeadOrAdmin = userRole === 'LEAD' || userRole === 'ADMIN';
  const isMemberOrAbove = isLeadOrAdmin || userRole === 'MEMBER';

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

  // Handle Comment Submission
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, commentText.trim());
      setCommentText('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="bento-card p-6 bg-slate-900/60 border border-slate-800 space-y-6">
      {/* Detail Header & Edit Button */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 mb-1">
            <span>Team: <strong className="text-slate-200">{item.team_name}</strong></span>
            <span>•</span>
            <span>Type: <strong className="text-slate-200 uppercase">{item.type}</strong></span>
            <span>•</span>
            <span className="font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              v{item.version}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">{item.title}</h3>
        </div>

        {isMemberOrAbove && !isEditing && (
          <button
            onClick={startEdit}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg glass-pill text-xs font-medium text-slate-300 hover:text-white"
          >
            <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Edit</span>
          </button>
        )}
      </div>

      {/* Conflict / Error Banners */}
      {conflictNotice && (
        <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{conflictNotice}</span>
          </div>
          <button onClick={onRefresh} className="text-[10px] uppercase font-bold underline hover:text-white">
            Refresh
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Edit Mode vs Read-only Description */}
      {isEditing ? (
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Priority</label>
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as Priority)}
              className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none"
            >
              <option value="URGENT">Urgent (P0)</option>
              <option value="HIGH">High (P1)</option>
              <option value="MEDIUM">Medium (P2)</option>
              <option value="LOW">Low (P3)</option>
            </select>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={isActionLoading}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold shadow-md"
            >
              {isActionLoading ? 'Saving...' : 'Save (Optimistic Lock)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-950/30 p-4 rounded-xl border border-slate-800/80">
          {item.description}
        </div>
      )}

      {/* Discussion & Transactional Audit History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
        {/* Comments Column */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Discussion ({comments.length})</span>
          </div>

          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              rows={2}
              placeholder="Add verification note or discussion..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={isSubmittingComment || !commentText.trim()}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow disabled:opacity-40"
            >
              {isSubmittingComment ? 'Posting...' : 'Post Comment'}
            </button>
          </form>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No comments posted yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-semibold text-slate-300">{c.author_name}</span>
                    <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{c.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Transactional Audit Log Column */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Audit Trail ({activity.length})</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No activity recorded yet.</p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                    <span className="font-semibold text-cyan-300">{a.event_type.replace('_', ' ')}</span>
                    <span>{new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-slate-300">
                    <span className="font-medium text-slate-200">{a.actor_name}</span>
                    {a.details && (
                      <span className="ml-1 text-[10px] text-slate-400 font-mono">
                        ({typeof a.details === 'string' ? a.details : JSON.stringify(a.details)})
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
