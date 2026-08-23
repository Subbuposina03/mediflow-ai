import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, Mail, Lock, User as UserIcon, Phone, ArrowRight, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export const Register: React.FC = () => {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name,
        email,
        phone: phone || undefined,
        password,
        role: 'patient'
      });
      setSuccess(true);
      
      setTimeout(async () => {
        try {
          await login(email, password);
          navigate('/dashboard');
        } catch (loginErr) {
          navigate('/login');
        }
      }, 1500);

    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      let msg = 'Registration failed. Try a different email.';
      if (typeof detail === 'string') {
        if (detail.toLowerCase().includes('already exist') || detail.toLowerCase().includes('already registered')) {
          msg = 'Email already registered. Please login.';
        } else {
          msg = detail;
        }
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      } else if (!err.response) {
        msg = 'Unable to connect to server. Please ensure backend server is running.';
      }
      setError(msg);
      setSubmitting(false);
    }

  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative bg-slate-50 dark:bg-slate-950">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse-glow" />
      
      <div className="w-full max-w-md glass border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-lg relative z-10 bg-white/70 dark:bg-slate-900/70">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="bg-sky-500/10 p-3 rounded-2xl">
              <Activity className="h-8 w-8 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">MediFlow AI</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 font-medium">
            AI-Powered Hospital Queue &amp; Appointment Management System
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2.5 bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 text-red-750 dark:text-red-400 p-3.5 rounded-xl text-xs">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-250 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-450 p-3.5 rounded-xl text-xs">
            <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>Registration successful! Redirecting to dashboard...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <UserIcon className="h-4.5 w-4.5" />
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-xs transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Mail className="h-4.5 w-4.5" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-xs transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
              Phone Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Phone className="h-4.5 w-4.5" />
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-xs transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Lock className="h-4.5 w-4.5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-xs transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 flex items-center justify-center space-x-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl transition shadow-md hover:shadow-sky-500/20 disabled:opacity-70 disabled:pointer-events-none text-xs"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                <span>Registering Account...</span>
              </>
            ) : (
              <>
                <span>Register Account</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-sky-600 hover:text-sky-700 transition">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
export default Register;
