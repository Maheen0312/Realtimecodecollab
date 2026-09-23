import React, { useState, FC, FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CodeDeathLogo } from '../components/CodeDeathLogo';
import { Toaster } from 'react-hot-toast';
import { 
  LogIn, 
  ArrowRight, 
  KeyRound, 
  Mail, 
  Eye, 
  EyeOff, 
  Lock, 
  Terminal, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

export const LoginPage: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithEmail, loginWithGoogle, sendResetEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Protected route resolution: room links must route to dashboard with room prefilled, never directly into the room
  const getPostAuthRedirect = (): string => {
    const from = (location.state as any)?.from;
    if (!from) return '/dashboard';
    const pathname = typeof from === 'string' ? from : from.pathname || '/dashboard';
    const search = typeof from === 'object' && from.search ? from.search : '';

    if (pathname.startsWith('/room/')) {
      const rId = pathname.replace('/room/', '').split('/')[0];
      return `/dashboard?room=${encodeURIComponent(rId)}`;
    }
    if (pathname.startsWith('/join/')) {
      const rCode = pathname.replace('/join/', '').split('/')[0];
      return `/dashboard?room=${encodeURIComponent(rCode)}`;
    }
    if (pathname === '/join' || pathname === '/join/') {
      const params = new URLSearchParams(search);
      const room = params.get('room');
      if (room) {
        return `/dashboard?room=${encodeURIComponent(room)}`;
      }
      return '/dashboard';
    }
    return pathname;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsSubmitting(true);
    try {
      await loginWithEmail(email, password);
      navigate(getPostAuthRedirect(), { replace: true });
    } catch {
      // Error toast is handled in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate(getPostAuthRedirect(), { replace: true });
    } catch {
      // Handled in AuthContext
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSending(true);
    try {
      await sendResetEmail(resetEmail);
      setResetSent(true);
    } catch {
      // Handled in AuthContext
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between text-slate-100 bg-[#080c14] overflow-x-hidden select-none font-sans">
      <Toaster position="top-right" />

      {/* Cyber Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Radiant glow accents */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between border-b border-slate-800/60">
        <CodeDeathLogo size="md" showText={true} subtitle="DEVELOPER LOGIN" />
        <Link
          to="/signup"
          className="text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40"
        >
          Create Account
        </Link>
      </header>

      {/* Main Two-Column Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 lg:py-12 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,440px)] gap-10 lg:gap-14 xl:gap-20 items-center justify-between">
          
          {/* Left Side: Brand Overview */}
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Developer Collaboration Platform</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
                CODE DEATH
              </h1>
              <p className="text-base sm:text-xl text-slate-300 font-semibold leading-snug">
                Build together. Code together.
              </p>
            </div>

            <p className="text-sm sm:text-[15px] text-slate-300/90 leading-relaxed max-w-xl">
              <strong className="text-white font-semibold">CODE DEATH</strong> is a collaborative developer workspace for real-time coding, project sharing, terminal execution, AI assistance, and team communication.
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs sm:text-[13px] text-slate-300">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">⚡</span>
                <span className="font-medium">Real-time code collaboration</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">📁</span>
                <span className="font-medium">Shared project workspace</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">💻</span>
                <span className="font-medium">Integrated terminal</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-cyan-400 text-sm">🤖</span>
                <span className="font-medium">Gemini AI assistance</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 sm:col-span-2">
                <span className="text-cyan-400 text-sm">🎥</span>
                <span className="font-medium">Video, audio & screen sharing</span>
              </div>
            </div>
          </div>

          {/* Right Side: Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="w-full max-w-[440px] justify-self-center lg:justify-self-end bg-slate-900/95 border border-slate-800/90 rounded-2xl p-7 sm:p-8 shadow-2xl backdrop-blur-2xl space-y-6"
          >
            <div className="space-y-1 text-left">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                Welcome Back
              </h2>
              <p className="text-xs text-slate-400">
                Sign in to your CODE DEATH developer workspace.
              </p>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setResetSent(false);
                      setShowResetModal(true);
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-rose-500 hover:from-cyan-400 hover:via-indigo-500 hover:to-rose-400 text-white font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>LOGIN</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] font-mono text-slate-500 uppercase tracking-wider relative">
                or continue with
              </span>
            </div>

            {/* Google OAuth Sign-in */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
            >
              {isGoogleLoading ? (
                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.9z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8 0-1.3.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Signup Redirect Footer */}
            <div className="pt-1 text-center text-xs text-slate-400">
              <span>Don't have an account? </span>
              <Link
                to="/signup"
                className="text-cyan-400 hover:text-cyan-300 font-bold underline-offset-4 hover:underline transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-400">CODE DEATH</span>
          <span>•</span>
          <span>Build together. Code together.</span>
        </div>
        <div className="text-slate-600 font-mono">v3.0.0</div>
      </footer>

      {/* Forgot Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-slate-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Reset Password</h3>
                <p className="text-xs text-slate-400">We will email you a secure reset link.</p>
              </div>
            </div>

            {resetSent ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Reset email dispatched!</span>
                </div>
                <p>Check your inbox for <strong>{resetEmail}</strong> and follow the link.</p>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="mt-3 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Account Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="developer@company.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:outline-none focus:border-cyan-500 text-slate-100"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetSending}
                    className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white flex items-center justify-center gap-1.5"
                  >
                    {resetSending ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>Send Link</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};
