import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, LogOut, Sun, Moon, User as UserIcon, Menu, X } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [darkTheme, setDarkTheme] = useState<boolean>(
    localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (darkTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkTheme]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 glass shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Activity className="h-8 w-8 text-sky-600 dark:text-sky-400 animate-pulse" />
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-sky-600 to-indigo-600 dark:from-sky-400 dark:to-indigo-400 bg-clip-text text-transparent">
                MediFlow AI
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-6">
            {user && (
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <UserIcon className="h-4 w-4" />
                {user.name} ({user.role.toUpperCase()})
              </span>
            )}
            

            
            {user && (
              <Link 
                to={user.role === 'admin' ? '/admin' : user.role === 'doctor' ? '/doctor' : '/dashboard'}
                className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                Dashboard
              </Link>
            )}

            <button
              onClick={() => setDarkTheme(!darkTheme)}
              className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200 transition"
              aria-label="Toggle Theme"
            >
              {darkTheme ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
            </button>

            {user ? (
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1.5 bg-rose-550 hover:bg-rose-600 text-white font-semibold text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition shadow-sm"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/login"
                  className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition shadow-sm"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden items-center space-x-2">
            <button
              onClick={() => setDarkTheme(!darkTheme)}
              className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200 transition"
            >
              {darkTheme ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass border-t border-slate-200 dark:border-slate-800 py-4 px-4 space-y-3">
          {user && (
            <div className="pb-2 border-b border-slate-250 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
              Signed in as: <strong className="text-slate-800 dark:text-white">{user.name}</strong>
            </div>
          )}

          {user && (
            <Link 
              to={user.role === 'admin' ? '/admin' : user.role === 'doctor' ? '/doctor' : '/dashboard'}
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 transition"
            >
              Dashboard
            </Link>
          )}
          {user ? (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center justify-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2 rounded-lg transition"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          ) : (
            <div className="flex flex-col space-y-2.5">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 font-semibold text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm py-2 rounded-lg transition shadow-sm"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
export default Navbar;
