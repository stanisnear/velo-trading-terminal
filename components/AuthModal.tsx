
import React, { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Zap, AlertCircle } from 'lucide-react';
import { signUp, signIn, isSupabaseConfigured } from '../services/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: any, profile: any) => void;
  onFallbackLogin?: (username: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuth, onFallbackLogin }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabaseReady = isSupabaseConfigured();

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    // If Supabase not configured, use fallback (demo mode)
    if (!supabaseReady) {
      if (!username.trim()) {
        setError('Enter a username');
        return;
      }
      onFallbackLogin?.(username.trim());
      onClose();
      return;
    }

    // Validate
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (mode === 'signup' && !username.trim()) { setError('Username is required'); return; }

    setLoading(true);

    if (mode === 'signup') {
      const { user, error: authError } = await signUp(email, password, username);
      if (authError) {
        setError(authError);
        setLoading(false);
        return;
      }
      setSuccess('Account created! Check your email to confirm, then sign in.');
      setMode('signin');
      setLoading(false);
    } else {
      const { user, error: authError } = await signIn(email, password);
      if (authError) {
        setError(authError);
        setLoading(false);
        return;
      }
      if (user) {
        onAuth(user, null);
        onClose();
      }
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 animate-bounce-in" onClick={(e: any) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <Zap size={22} fill="currentColor"/>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white">
                {mode === 'signin' ? 'Welcome back' : 'Join VELO'}
              </h2>
              <p className="text-xs text-gray-500">
                {supabaseReady 
                  ? (mode === 'signin' ? 'Sign in to your account' : 'Create your trading account')
                  : 'Enter a username to start trading (demo mode)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <X size={20}/>
          </button>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0"/>
            <p className="text-xs text-red-500 font-medium">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <p className="text-xs text-emerald-500 font-medium">{success}</p>
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          {/* Username (signup or demo mode) */}
          {(mode === 'signup' || !supabaseReady) && (
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {/* Email & Password (only when Supabase is configured) */}
          {supabaseReady && (
            <>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus={mode === 'signin'}
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-10 pr-10 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
          ) : (
            supabaseReady
              ? (mode === 'signin' ? 'Sign In' : 'Create Account')
              : 'Start Trading'
          )}
        </button>

        {/* Demo balance note */}
        {!supabaseReady && (
          <p className="text-center text-[10px] text-gray-400 mt-3">
            Demo mode — starts with $10,000 balance
          </p>
        )}

        {/* Toggle mode */}
        {supabaseReady && (
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
              <button 
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); }}
                className="ml-1 text-blue-500 font-bold hover:underline"
              >
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
