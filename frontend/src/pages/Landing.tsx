import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ShieldAlert, Sparkles, RefreshCw, ChevronRight } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      {/* Premium subtle background glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500/10 dark:bg-sky-500/5 rounded-full filter blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full filter blur-[100px] pointer-events-none" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-20 relative z-10">
        {/* Hero Banner Section */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center space-x-2 bg-sky-100/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-850/60 rounded-full px-4 py-1.5 shadow-sm">
            <Sparkles className="h-4 w-4 text-sky-700 dark:text-sky-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300">
              Next-Gen Clinic Management
            </span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.1] md:leading-[1.05]">
            MediFlow AI<br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-sky-700 to-indigo-800 dark:from-sky-400 dark:to-indigo-300 bg-clip-text text-transparent text-2xl sm:text-4xl block mt-2 font-bold">
              AI-Powered Hospital Queue &amp; Appointment Management System
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            MediFlow AI orchestrates patient waiting lines, automates health priority organization, and provides real-time queue forecasts to deliver a seamless clinician and patient experience.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              to="/login"
              className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-bold px-8 py-3 rounded-xl transition shadow-md hover:shadow-sky-500/25 flex items-center justify-center gap-1.5"
            >
              <span>Access Clinic Portal</span>
              <ChevronRight className="h-4.5 w-4.5" />
            </Link>
            <Link
              to="/register"
              className="w-full sm:w-auto bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold px-8 py-3 rounded-xl transition border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center"
            >
              Register Patient Account
            </Link>
          </div>
        </div>

        {/* Dynamic Metric Widgets */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { value: '42%', label: 'Average Queue Time Reduction' },
            { value: '15m', label: 'Average Patient Wait Time' },
            { value: '98%', label: 'Healthcare Provider Satisfaction' }
          ].map((stat, idx) => (
            <div 
              key={idx} 
              className="bg-white dark:bg-slate-900/60 rounded-2xl p-6 text-center border border-slate-200/60 dark:border-slate-850 shadow-sm flex flex-col justify-center items-center gap-1"
            >
              <span className="text-3xl sm:text-4xl font-black text-sky-600 dark:text-sky-400">{stat.value}</span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-24 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">Smart Engine Architectures</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Engineered with advanced algorithms to streamline hospital throughput.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900/40 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-850 shadow-sm flex flex-col gap-4">
              <div className="bg-sky-500/10 p-3 rounded-2xl w-fit">
                <Clock className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Wait Time Predictor</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Predictive scheduling engines dynamically evaluate historical consulting speed, staff ratios, and live volumes to broadcast accurate wait parameters.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-850 shadow-sm flex flex-col gap-4">
              <div className="bg-indigo-500/10 p-3 rounded-2xl w-fit">
                <ShieldAlert className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Emergency Priority Health Check</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Real-time priority checks evaluate clinical signals and description markers, instantly prioritizing urgent medical events in the queue.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-850 shadow-sm flex flex-col gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-2xl w-fit">
                <RefreshCw className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Live Queue Synchronization</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Persistent bidirectional WebSocket connections broadcast queue movements instantly to all consulting rooms and customer dashboard views.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Footer */}
        <footer className="mt-28 pt-8 border-t border-slate-200 dark:border-slate-900 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} MediFlow AI. Enterprise Hospital Infrastructure Systems. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
};

export default Landing;
