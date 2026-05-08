'use client'

import { useState, useEffect } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/storage'
import AuthForm from '@/components/AuthForm'
import Dashboard from '@/components/Dashboard'
import RedZoneView from '@/components/RedZoneView'
import AllLeaguesView from '@/components/AllLeaguesView'
import AppShell, { type AppView } from '@/components/AppShell'
import Image from 'next/image'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<AppView>(
    typeof window !== 'undefined' ? (storage.getCurrentView() || 'dashboard') : 'dashboard'
  )

  useEffect(() => {
    let isMounted = true

    const applySession = (session: Session | null) => {
      if (!isMounted) return

      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      const cachedUserId = storage.getActiveUserId()

      if (nextUserId && cachedUserId !== nextUserId) {
        storage.clearCache()
        setCurrentView('dashboard')
        storage.setActiveUserId(nextUserId)
      }

      if (!nextUserId) {
        storage.clearCache()
        setCurrentView('dashboard')
      } else if (cachedUserId === nextUserId) {
        storage.setActiveUserId(nextUserId)
      }

      setUser(nextUser)
    }

    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      applySession(session)

      if (isMounted) {
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session)
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    storage.clearCache()
    setCurrentView('dashboard')
    await supabase.auth.signOut()
  }

  const handleNavigate = (view: AppView) => {
    setCurrentView(view)
    storage.setCurrentView(view)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-600 border-t-blue-500 mx-auto mb-6"></div>
          <p className="text-slate-400 text-lg">Loading application...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-900 text-white">
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-12">
              <Image 
                src="/logo.png" 
                alt="RedZone Companion" 
                width={192} 
                height={192} 
                className="mx-auto mb-6" 
                priority 
              />
              <h1 className="text-5xl font-bold mb-4 gradient-bg bg-clip-text text-transparent">
                RedZone Companion
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed">
                Professional fantasy football tracking across multiple leagues during live games
              </p>
            </div>
            <AuthForm />
          </div>
        </div>
      </main>
    )
  }

  const activeView = currentView === 'redzone'
    ? <RedZoneView user={user} onBackToDashboard={() => handleNavigate('dashboard')} />
    : currentView === 'allleagues'
      ? <AllLeaguesView user={user} onBackToDashboard={() => handleNavigate('dashboard')} />
      : (
        <Dashboard
          user={user}
          onStartRedZoneSession={() => handleNavigate('redzone')}
          onViewAllLeagues={() => handleNavigate('allleagues')}
        />
      )

  return (
    <AppShell
      user={user}
      currentView={currentView}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {activeView}
    </AppShell>
  )
}
