import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Clock } from 'lucide-react';

export const PaymentSuccess: React.FC = () => {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 animate-fade-in">
      <div className="glass rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl bg-white/80 dark:bg-slate-900/80 text-center space-y-6 relative overflow-hidden">
        <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/15 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
          <CheckCircle2 className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-3 py-1 rounded-full border border-purple-200 dark:border-purple-900/40">
            <Clock className="h-3.5 w-3.5" />
            <span>Pay at Counter</span>
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Appointment Booked
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            All appointments are booked under Pay at Counter. Please complete payment cash or card at the hospital reception desk before your consultation.
          </p>
        </div>

        <div className="pt-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-md"
          >
            <span>Return to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
