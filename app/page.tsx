'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/storage'
import AuthForm from '@/components/AuthForm'
import Dashboard from '@/components/Dashboard'
import RedZoneView from '@/components/RedZoneView'
import Image from 'next/image'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'dashboard' | 'redzone'>(
    typeof window !== 'undefined' ? (storage.getCurrentView() || 'dashboard') : 'dashboard'
  )

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setCurrentView('dashboard')
    storage.setCurrentView('dashboard')
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

  if (currentView === 'redzone') {
    return <RedZoneView user={user} onBackToDashboard={() => {
      setCurrentView('dashboard')
      storage.setCurrentView('dashboard')
    }} />
  }

  return (
    <Dashboard 
      user={user} 
      onLogout={handleLogout}
      onStartRedZoneSession={() => {
        setCurrentView('redzone')
        storage.setCurrentView('redzone')
      }}
    />
  )
}