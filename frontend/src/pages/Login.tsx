import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Radar, Activity, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCameras, getHealth } from '../api/cameras';
import { BrandLogo } from '../components/BrandLogo';

const ACCENT = '#e4472a';

export const Login: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [emailOrUsername, setEmailOrUsername] = useState('operator@trafficguard.ai');
  const [password, setPassword] = useState('admin123');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [cameraCount, setCameraCount] = useState<number | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(h => {
        setBackendOnline(true);
        setEngine(h.model.device);
      })
      .catch(() => setBackendOnline(false));
    getCameras().then(c => setCameraCount(c.length)).catch(() => setCameraCount(null));
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!emailOrUsername.trim()) return setErrorMessage('Please enter your work email or operator ID.');
    if (!password) return setErrorMessage('Please enter your passphrase.');
    try {
      setIsSubmitting(true);
      await login({ emailOrUsername, password, rememberMe });
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (userType: 'chief' | 'analyst') => {
    if (userType === 'chief') {
      setEmailOrUsername('operator@trafficguard.ai');
      setPassword('admin123');
    } else {
      setEmailOrUsername('analyst.chen@trafficguard.ai');
      setPassword('analyst2026');
    }
    setErrorMessage(null);
  };

  const inputCls =
    'w-full px-4 py-3 rounded-lg bg-[#fbf9f5] border border-[#ddd6cb] text-[15px] text-[#1b2230] placeholder-[#9a9287] outline-none transition-all focus:border-[#e4472a] focus:ring-2 focus:ring-[#e4472a]/15';

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.08fr_1fr] bg-[#172231]">
      {/* ================= LEFT: brand panel ================= */}
      <aside className="force-dark relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#172231] px-14 py-12 text-white select-none">
        {/* radar rings */}
        <div className="pointer-events-none absolute -right-[22%] top-1/2 -translate-y-1/2 w-[860px] h-[860px] rounded-full bg-white/[0.025]" />
        <div className="pointer-events-none absolute -right-[16%] top-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#2a1f2b]/70" />
        <div className="pointer-events-none absolute -right-[10%] top-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full border border-[#e4472a]/35 bg-[#172231]" />
        <div className="pointer-events-none absolute -right-[10%] top-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full animate-radar"
          style={{ background: 'conic-gradient(from 0deg, rgba(228,71,42,0.16), transparent 18%)' }} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(228,71,42,0.08),transparent_45%)]" />

        {/* brand */}
        <div className="relative flex items-center gap-3">
          <BrandLogo size={52} />
          <span className="text-[17px] font-extrabold tracking-[0.18em]">SADARAKSHAK</span>
        </div>

        {/* headline */}
        <div className="relative max-w-xl">
          <div className="text-[12px] font-mono tracking-[0.22em] text-slate-400 uppercase">Accident Intelligence / Live</div>
          <h1 className="mt-5 text-[56px] leading-[1.02] font-black tracking-tight">
            Guard every road.
            <span className="block" style={{ color: '#f2795c' }}>Respond in seconds.</span>
          </h1>
          <p className="mt-7 text-[17px] leading-relaxed text-slate-300 max-w-lg">
            A real-time command surface for road-safety teams. CCTV feeds, YOLO11 accident detection and
            saved evidence — in one line of sight.
          </p>
        </div>

        {/* footer */}
        <div className="relative pt-6 border-t border-white/10 flex items-center justify-between text-[12px] font-mono tracking-[0.18em] uppercase text-slate-400">
          <span>Real-time road safety network</span>
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                backendOnline === false ? 'bg-red-500' : backendOnline ? 'bg-emerald-400 live-dot' : 'bg-slate-500'
              }`}
            />
            {backendOnline === false ? 'Backend offline' : backendOnline ? 'Systems nominal' : 'Checking...'}
          </span>
        </div>
      </aside>

      {/* ================= RIGHT: sign-in form ================= */}
      <main className="force-light relative flex items-center justify-center bg-[#f4f1ec] px-6 py-12 sm:px-12 min-h-screen">
        <div className="w-full max-w-[488px] animate-page-in">
          {/* compact brand for small screens */}
          <div className="flex lg:hidden items-center gap-2.5 mb-10">
            <BrandLogo variant="plain" size={56} />
            <span className="font-extrabold tracking-[0.18em] text-[#1b2230]">SADARAKSHAK</span>
          </div>

          <div className="text-[13px] font-mono tracking-[0.2em] text-[#6f7a8a] uppercase">Control Room Access</div>
          <h2 className="mt-3 text-[40px] leading-tight font-black tracking-tight text-[#1b2230]">Welcome back.</h2>
          <p className="mt-2 text-[17px] text-[#5d6878]">Sign in to the SADARAKSHAK accident response desk.</p>

          {errorMessage && (
            <div className="mt-6 p-3 rounded-lg bg-[#fdecea] border border-[#f3b8ad] flex items-start gap-2.5 text-[#a8321d] text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div>
              <label htmlFor="login-email" className="block text-[15px] font-semibold text-[#1b2230] mb-2">Work email</label>
              <input
                id="login-email"
                type="text"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                placeholder="operator@example.org"
                className={inputCls}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="login-pass" className="block text-[15px] font-semibold text-[#1b2230] mb-2">Passphrase</label>
              <div className="relative">
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputCls} pr-12`}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#6f7a8a] hover:text-[#1b2230] hover:bg-black/5 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide passphrase' : 'Show passphrase'}
                  title={showPassword ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : password ? <Eye className="w-4.5 h-4.5" /> : <Lock className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-[#5d6878]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: ACCENT }}
              />
              <span>Keep me signed in on this device</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="on-accent w-full py-4 rounded-lg text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#e4472a]/25 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Enter control room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-[#e2dcd2] grid grid-cols-3 text-center">
            <div className="flex flex-col items-center gap-2">
              <Radar className="w-5 h-5 text-[#1f8a70]" />
              <span className="text-[13px] text-[#5d6878]">
                {cameraCount != null ? `${String(cameraCount).padStart(2, '0')} feeds` : 'CCTV feeds'}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Activity className="w-5 h-5" style={{ color: ACCENT }} />
              <span className="text-[13px] text-[#5d6878]">{engine ? `Live AI · ${engine}` : 'Live AI'}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#1f8a70]" />
              <span className="text-[13px] text-[#5d6878]">Evidence saved</span>
            </div>
          </div>

          <div className="mt-8 text-center text-[12px] text-[#8a8378]">
            Demo accounts:{' '}
            <button type="button" onClick={() => handleQuickFill('chief')} className="underline hover:text-[#1b2230] cursor-pointer">
              Control Chief
            </button>
            {' · '}
            <button type="button" onClick={() => handleQuickFill('analyst')} className="underline hover:text-[#1b2230] cursor-pointer">
              Incident Analyst
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
