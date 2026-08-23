import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';

export const PaymentCancel: React.FC = () => {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 animate-fade-in">
      <div className="glass rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl bg-white/80 dark:bg-slate-900/80 text-center space-y-6 relative overflow-hidden">
        <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/15 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
          <Clock className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Pay at Counter
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            Online checkout is disabled. All consultations are booked directly using Pay at Counter.
          </p>
        </div>

        <div className="pt-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-md"
          >
            <span>Go to Patient Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
