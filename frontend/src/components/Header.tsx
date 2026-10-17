import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Plus, UserCheck, AlertTriangle } from 'lucide-react';

interface HeaderProps {
  onOpenCreateModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCreateModal }) => {
  const { currentUser, users, switchUser } = useAuth();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Info */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-slate-950 text-xl tracking-tighter shadow-inner">
              N
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">Newtonite Ops</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Operations Under Pressure
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Internal Operational Work Coordination & Concurrency Engine
              </p>
            </div>
          </div>

          {/* Right Action Bar & Reviewer Persona Switcher */}
          <div className="flex items-center space-x-4">
            {/* Create Item Button */}
            <button
              onClick={onOpenCreateModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold shadow transition duration-150"
            >
              <Plus className="w-4 h-4" />
              <span>Create Item</span>
            </button>

            {/* Persona Switcher for Live Demo Reviewers */}
            <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-md">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-left">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Active Persona (Demo)
                </label>
                <select
                  value={currentUser?.id || ''}
                  onChange={(e) => switchUser(e.target.value)}
                  className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100">
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
