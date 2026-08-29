'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    setFullscreenSupported(Boolean(document.fullscreenEnabled))

    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isNavOpen && !(e.target as Element)?.closest('.relative')) {
        setIsNavOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isNavOpen])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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

            <div className="flex justify-end gap-2 self-end md:self-auto">
              <div id="view-header-actions" className="flex items-center gap-2" />

              {fullscreenSupported && (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-pressed={isFullscreen}
                  aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                  title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                  className="btn btn-secondary shrink-0 px-4 py-3"
                >
                  {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                      <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                      <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 1-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
                    </svg>
                  )}
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsNavOpen(!isNavOpen)}
                  aria-expanded={isNavOpen}
                  aria-controls="primary-navigation"
                  aria-label="Menu"
                  title="Menu"
                  className="btn btn-secondary shrink-0 px-4 py-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                {isNavOpen && (
                  <nav
                    id="primary-navigation"
                    aria-label="Primary navigation"
                    className="absolute right-0 top-full z-50 mt-2 min-w-50 rounded-lg border border-slate-600 bg-slate-800 shadow-xl"
                  >
                    {navItems.map(item => {
                      const isActive = item.view === currentView

                      return (
                        <button
                          key={item.view}
                          type="button"
                          onClick={() => {
                            onNavigate(item.view)
                            setIsNavOpen(false)
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          className={`block w-full px-4 py-3 text-left text-sm font-semibold transition-colors first:rounded-t-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setIsNavOpen(false)
                        onLogout()
                      }}
                      className="block w-full rounded-b-lg border-t border-slate-700 px-4 py-3 text-left text-sm font-semibold text-red-400 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                    >
                      Sign Out
                    </button>
                  </nav>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        {children}
      </main>
    </div>
  )
}
