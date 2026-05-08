'use client'

import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import Image from 'next/image'

export type AppView = 'dashboard' | 'redzone' | 'allleagues'

interface AppShellProps {
  user: User
  currentView: AppView
  onNavigate: (view: AppView) => void
  onLogout: () => void
  children: ReactNode
}

const navItems: Array<{ view: AppView; label: string }> = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'redzone', label: 'RedZone' },
  { view: 'allleagues', label: 'All Lineups' },
]

export default function AppShell({ user, currentView, onNavigate, onLogout, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-700/80 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Go to dashboard"
            >
              <Image
                src="/logo.png"
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 flex-shrink-0"
                priority
              />
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold leading-tight text-white">
                  RedZone Companion
                </div>
                <div className="truncate text-xs text-slate-400">
                  {user.email ?? 'Signed in'}
                </div>
              </div>
            </button>

            <nav aria-label="Primary navigation" className="flex flex-wrap gap-2">
              {navItems.map(item => {
                const isActive = item.view === currentView

                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => onNavigate(item.view)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      isActive
                        ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-950/40'
                        : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>

            <button
              type="button"
              onClick={onLogout}
              className="btn btn-secondary w-full sm:w-auto"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        {children}
      </main>
    </div>
  )
}
