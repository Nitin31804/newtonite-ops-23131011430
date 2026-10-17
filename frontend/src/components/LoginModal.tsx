import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Lock, Mail, ShieldAlert, Sparkles, User, UserPlus, ShieldCheck, X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  canDismiss?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  canDismiss = true,
}) => {
  const { login, setupAdmin, isDemoMode, needsSetup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await login(email.trim(), password);
    setIsLoading(false);

    if (res.success) {
      if (onClose) onClose();
    } else {
      setError(res.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required for initial administrator setup.');
      return;
    }

    if (password.length < 8) {
      setError('Master password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await setupAdmin(name.trim(), email.trim(), password);
    setIsLoading(false);

    if (res.success) {
      if (onClose) onClose();
    } else {
      setError(res.error || 'Failed to complete initial administrator setup.');
    }
  };

  const fillDemoPersona = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  };

  const allowClose = canDismiss && !needsSetup && onClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bento-card p-6 border border-slate-700/80 shadow-2xl rounded-3xl bg-slate-900/95">
        {/* Ambient Gradient Glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-emerald-500/20 rounded-3xl blur-xl pointer-events-none -z-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-full ${needsSetup ? 'bg-gradient-to-tr from-emerald-400 to-cyan-500' : 'bg-gradient-to-tr from-cyan-400 to-purple-500'} flex items-center justify-center shadow-md`}>
              {needsSetup ? <UserPlus className="w-4 h-4 text-white" /> : <LogIn className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-sans">
                {needsSetup ? 'Initial Administrator Setup' : 'Enterprise Sign In'}
              </h3>
              <p className="text-xs text-slate-400">
                {needsSetup ? 'Fresh Production Database Initializer' : 'Newtonite Ops Command Center'}
              </p>
            </div>
          </div>

          {allowClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Setup Banner if needsSetup */}
        {needsSetup && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-2 text-emerald-300 text-xs">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
            <span>
              Zero users detected in database. Provision the master administrator account to securely unlock the system.
            </span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center space-x-2 text-rose-300 text-xs">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        {needsSetup ? (
          <form onSubmit={handleSetupSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lead Administrator"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>Corporate Email</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. admin@company.internal"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span>Master Password (Min 8 Characters)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                minLength={8}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span>Confirm Master Password</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                minLength={8}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Provisioning Administrator...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Complete Setup & Log In</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>Corporate Email</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. eng.lead@newtonite.internal"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span>Password</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-purple-500/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In with Credentials</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Evaluation Quick Fill (Available in Demo Mode when not in setup) */}
        {!needsSetup && isDemoMode && (
          <div className="mt-6 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-1.5 mb-2.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Evaluator Quick-Fill (Demo Personas)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fillDemoPersona('eng.lead@newtonite.internal')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
              >
                <span className="font-semibold block text-[11px] text-emerald-400">Sarah Connor</span>
                <span className="text-[10px] text-slate-400">Eng Lead</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoPersona('pay.lead@newtonite.internal')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
              >
                <span className="font-semibold block text-[11px] text-amber-400">Marcus Sterling</span>
                <span className="text-[10px] text-slate-400">Payments Lead</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoPersona('cmp.lead@newtonite.internal')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
              >
                <span className="font-semibold block text-[11px] text-cyan-400">Rachel Zane</span>
                <span className="text-[10px] text-slate-400">Compliance Lead</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoPersona('admin@newtonite.internal')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition"
              >
                <span className="font-semibold block text-[11px] text-purple-400">Alex Vance</span>
                <span className="text-[10px] text-slate-400">Global Admin</span>
              </button>
            </div>
          </div>
        )}

        {/* Security Footnote */}
        <div className="mt-4 text-center text-[10px] text-slate-500">
          Cryptographically signed JWT verification via bcrypt hash check.
        </div>
      </div>
    </div>
  );
};
