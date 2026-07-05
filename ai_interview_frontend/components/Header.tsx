"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, User, LogOut } from "lucide-react";

export default function Header() {
  // Toggle this to true to test the logged-in state
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header className="w-full bg-[var(--bg-color)] text-[var(--text-primary)] border-b border-[var(--border-color)]/30 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          
          {/* Logo */}
          <div className="flex-shrink-0 w-auto lg:w-[30%]">
            <Link href="/" className="text-2xl font-black text-[var(--accent-color)] tracking-tighter uppercase">
              AI Interview Coach
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center justify-end flex-1 gap-8">
            <div className="flex items-center gap-6 text-sm font-semibold">
              <Link href="/analysis" className="hover:text-[var(--accent-color)] transition-colors">
                Resume Analysis
              </Link>
              <Link href="/jobs" className="hover:text-[var(--accent-color)] transition-colors">
                Browse Jobs
              </Link>
              {isLoggedIn && (
                <Link href="/dashboard/candidate" className="hover:text-[var(--accent-color)] transition-colors">
                  Dashboard
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4 border-l border-[var(--border-color)]/30 pl-8 ml-2">
              {isLoggedIn ? (
                // Desktop Logged In State with Dropdown
                <div className="relative">
                  <div 
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                  >
                    <div className="w-10 h-10 rounded-full bg-[var(--surface-card-color)] flex items-center justify-center overflow-hidden border border-[var(--border-color)]">
                      <User size={20} className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" />
                    </div>
                    <span className="font-bold text-sm hover:text-[var(--accent-color)] transition-colors">User Name</span>
                  </div>

                  {/* Desktop Logout Dropdown */}
                  {isProfileOpen && (
                    <div className="absolute right-0 mt-3 w-48 bg-[var(--surface-card-color)] border border-[var(--border-color)] rounded-xl shadow-lg overflow-hidden py-1 z-50">
                      <button 
                        onClick={() => {
                          setIsLoggedIn(false);
                          setIsProfileOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-color)] text-[var(--accent-color)] font-bold transition-colors"
                      >
                        <LogOut size={18} />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Desktop Logged Out State
                <>
                  <Link 
                    href="/register" 
                    className="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--bg-color)] rounded-tr-2xl rounded-bl-2xl hover:opacity-80 hover:bg-[var(--surface-card-color)] hover:text-[var(--accent-color)] transition-all shadow-sm"
                  >
                    Register
                  </Link>
                  <Link 
                    href="/login" 
                    className="px-6 py-2 text-sm font-bold bg-[var(--bg-color)] text-[var(--text-primary)] border-2 border-[var(--text-primary)] rounded-tl-2xl rounded-br-2xl hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all"
                  >
                    Login
                  </Link>
                  <Link 
                    href="/dashboard/company" 
                    className="text-[var(--accent-color)] font-extrabold text-xs tracking-wide uppercase hover:underline ml-2"
                  >
                    Are you a company?
                  </Link>
                </>
              )}
            </div>
          </nav>

          {/* Mobile Right Side (Profile Pic + Hamburger) */}
          <div className="flex lg:hidden items-center gap-4">
            {isLoggedIn && (
              <div className="w-9 h-9 rounded-full bg-[var(--surface-card-color)] flex items-center justify-center overflow-hidden border border-[var(--border-color)]">
                <User size={18} className="text-[var(--text-secondary)]" />
              </div>
            )}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1 text-[var(--text-primary)] focus:outline-none"
            >
              {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="lg:hidden absolute top-20 left-0 w-full bg-[var(--bg-color)] border-b border-[var(--border-color)] shadow-xl flex flex-col px-4 pt-2 pb-6 gap-4 z-50">
          <Link href="/analysis" className="font-semibold py-3 border-b border-[var(--border-color)]/20" onClick={() => setIsMobileMenuOpen(false)}>Resume Analysis</Link>
          <Link href="/jobs" className="font-semibold py-3 border-b border-[var(--border-color)]/20" onClick={() => setIsMobileMenuOpen(false)}>Browse Jobs</Link>
          
          {isLoggedIn ? (
            <>
              <Link href="/dashboard/candidate" className="font-semibold py-3 border-b border-[var(--border-color)]/20" onClick={() => setIsMobileMenuOpen(false)}>Dashboard</Link>
              <button 
                onClick={() => {
                  setIsLoggedIn(false);
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 py-3 mt-2 text-[var(--accent-color)] font-bold"
              >
                <LogOut size={20} />
                Logout
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-4 pt-4">
              <Link href="/login" className="text-center py-3 bg-[var(--bg-color)] border-2 border-[var(--text-primary)] font-bold rounded-tl-2xl rounded-br-2xl" onClick={() => setIsMobileMenuOpen(false)}>
                Login
              </Link>
              <Link href="/register" className="text-center py-3 bg-[var(--accent-color)] text-[var(--bg-color)] font-bold rounded-tr-2xl rounded-bl-2xl" onClick={() => setIsMobileMenuOpen(false)}>
                Register
              </Link>
              <Link href="/dashboard/company" className="text-center text-[var(--accent-color)] font-bold uppercase text-xs tracking-wider" onClick={() => setIsMobileMenuOpen(false)}>
                Are you a company?
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}