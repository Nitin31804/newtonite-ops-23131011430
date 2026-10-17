import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Zap, Plus, ChevronDown, Sparkles, LogIn, LogOut } from 'lucide-react';

interface HeaderProps {
  onOpenCreateModal: () => void;
  onOpenRaceSimulator: () => void;
  onOpenLoginModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  onOpenRaceSimulator,
  onOpenLoginModal,
}) => {
  const { currentUser, users, switchUser, logout, isDemoMode } = useAuth();

  // Avatar initial color generator
  const getAvatarGradient = (id?: string) => {
    switch (id) {
      case 'usr-eng-lead':
        return 'from-emerald-400 to-teal-500';
      case 'usr-pay-lead':
        return 'from-purple-400 to-indigo-500';
      case 'usr-cmp-lead':
        return 'from-rose-400 to-pink-500';
      case 'usr-admin':
        return 'from-amber-400 to-orange-500';
      default:
        return 'from-cyan-400 to-blue-500';
    }
  };

  return (
    <header className="sticky top-0 z-40 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-3 w-full">
      <div className="bento-card rounded-full px-5 py-2.5 flex items-center justify-between shadow-2xl backdrop-blur-2xl bg-slate-900/80 border border-slate-700/60">
        {/* Left: Glowing Geometric Prism Logo & Brand */}
        <div className="flex items-center space-x-3.5">
          <div className="relative flex items-center justify-center">
            {/* Ambient Prism Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 rounded-full blur-md opacity-70 group-hover:opacity-100 transition duration-500" />
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              className="relative filter drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]"
            >
              <polygon points="16,3 29,26 16,21" fill="url(#prism-facet-1)" />
              <polygon points="16,3 3,26 16,21" fill="url(#prism-facet-2)" />
              <polygon points="3,26 29,26 16,21" fill="url(#prism-facet-3)" />
              <defs>
                <linearGradient id="prism-facet-1" x1="16" y1="3" x2="29" y2="26" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38bdf8" />
                  <stop offset="1" stopColor="#818cf8" />
                </linearGradient>
                <linearGradient id="prism-facet-2" x1="16" y1="3" x2="3" y2="26" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#c084fc" />
                  <stop offset="1" stopColor="#e879f9" />
                </linearGradient>
                <linearGradient id="prism-facet-3" x1="3" y1="26" x2="29" y2="26" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#06b6d4" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="flex items-center space-x-2.5">
            <span className="font-bold text-lg tracking-tight text-white font-sans">
              Newtonite
            </span>
            <span className="hidden md:inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>LIVE OPS</span>
            </span>
          </div>
        </div>

        {/* Center/Right: Floating Controls */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <>
              {/* Active Persona Segmented Switcher Pill (in demo mode or with personas) */}
              {users.length > 0 && (
                <div className="relative flex items-center glass-pill rounded-full px-3 py-1.5 border border-slate-700/80 hover:border-slate-600 transition">
                  <div
                    className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarGradient(
                      currentUser.id
                    )} flex items-center justify-center text-[10px] font-bold text-slate-950 mr-2 shadow-sm`}
                  >
                    {currentUser.name ? currentUser.name.charAt(0) : 'U'}
                  </div>

                  <div className="flex items-center space-x-1 cursor-pointer">
                    <select
                      value={currentUser.id || ''}
                      onChange={(e) => switchUser(e.target.value)}
                      className="appearance-none bg-transparent text-xs font-semibold text-slate-200 hover:text-white pr-5 cursor-pointer focus:outline-none"
                      aria-label="Active Persona Selector"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100 py-1">
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-3" />
                  </div>
                </div>
              )}

              {/* Sign Out Button */}
              <button
                onClick={logout}
                className="p-1.5 rounded-full text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* Sign In Button when unauthenticated */
            <button
              onClick={onOpenLoginModal}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-semibold shadow-sm transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Race Condition Simulator Button */}
          <button
            onClick={onOpenRaceSimulator}
            className="hidden sm:flex items-center space-x-1.5 px-4 py-1.5 rounded-full glass-pill text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-400/50 shadow-sm transition-all group"
            title="Demonstrate concurrent atomic claims and optimistic locking conflict"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform fill-amber-400/30" />
            <span>Race Condition Simulator</span>
          </button>

          {/* + New Item Iridescent Button */}
          <button
            onClick={onOpenCreateModal}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-teal-400 via-cyan-400 to-indigo-400 hover:opacity-95 text-slate-950 font-bold rounded-full text-xs shadow-lg shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Item</span>
          </button>
        </div>
      </div>
    </header>
  );
};
