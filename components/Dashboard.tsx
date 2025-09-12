'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/storage'
import { UserLeague } from '@/types'
import { fetchSleeperLeague } from '@/lib/api'
import SleeperUserSelector from './SleeperUserSelector'
import Image from 'next/image'

interface DashboardProps {
  user: User
  onLogout: () => void
  onStartRedZoneSession: () => void
}

export default function Dashboard({ user, onLogout, onStartRedZoneSession }: DashboardProps) {
  const [leagues, setLeagues] = useState<UserLeague[]>([])
  const [newLeagueId, setNewLeagueId] = useState('')
  const [newLeagueNickname, setNewLeagueNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingLeagueId, setPendingLeagueId] = useState<string | null>(null)
  const [editingLeagueId, setEditingLeagueId] = useState<number | null>(null)
  const [editNickname, setEditNickname] = useState('')

  useEffect(() => {
    // Try to load leagues from cache first
    const cachedLeagues = storage.getUserLeagues()
    if (cachedLeagues && cachedLeagues.length > 0) {
      setLeagues(cachedLeagues)
    }
    
    // Always fetch fresh data but don't block UI
    fetchLeagues()
  }, [])

  const fetchLeagues = async () => {
    try {
      const { data, error } = await supabase
        .from('user_leagues')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      const leagues = data || []
      setLeagues(leagues)
      
      // Cache the leagues data
      storage.setUserLeagues(leagues)
    } catch (error: any) {
      setMessage('Error fetching leagues: ' + error.message)
    }
  }

  const addLeague = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeagueId.trim()) return

    // Check if league already exists
    const existingLeague = leagues.find(l => l.sleeper_league_id === newLeagueId.trim())
    if (existingLeague) {
      setMessage(`League "${existingLeague.league_name || 'Unnamed League'}" is already added!`)
      return
    }

    // Show user selector for this league
    setPendingLeagueId(newLeagueId.trim())
  }

  const handleUserSelected = async (sleeperUserId: string, displayName: string) => {
    if (!pendingLeagueId) return

    setLoading(true)
    setMessage('')

    try {
      // Fetch the actual league name from Sleeper
      const leagueData = await fetchSleeperLeague(pendingLeagueId)
      const leagueName = leagueData.name || `League ${pendingLeagueId}`

      const { error } = await supabase
        .from('user_leagues')
        .insert({
          user_id: user.id,
          sleeper_league_id: pendingLeagueId,
          sleeper_user_id: sleeperUserId,
          league_name: leagueName,
          custom_nickname: newLeagueNickname.trim() || null,
        })

      if (error) throw error
      
      setNewLeagueId('')
      setNewLeagueNickname('')
      setPendingLeagueId(null)
      const displayLeagueName = newLeagueNickname.trim() || leagueName
      setMessage(`League "${displayLeagueName}" added successfully! You are: ${displayName}`)
      fetchLeagues()
    } catch (error: any) {
      setMessage('Error adding league: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUserSelectionCancel = () => {
    setPendingLeagueId(null)
    setMessage('')
  }

  const removeLeague = async (leagueId: number) => {
    try {
      const { error } = await supabase
        .from('user_leagues')
        .delete()
        .eq('id', leagueId)
        .eq('user_id', user.id)

      if (error) throw error
      
      setMessage('League removed successfully!')
      fetchLeagues()
    } catch (error: any) {
      setMessage('Error removing league: ' + error.message)
    }
  }

  const startEditNickname = (league: UserLeague) => {
    setEditingLeagueId(league.id)
    setEditNickname(league.custom_nickname || '')
  }

  const cancelEditNickname = () => {
    setEditingLeagueId(null)
    setEditNickname('')
  }

  const saveEditNickname = async (leagueId: number) => {
    try {
      const { error } = await supabase
        .from('user_leagues')
        .update({ 
          custom_nickname: editNickname.trim() || null 
        })
        .eq('id', leagueId)
        .eq('user_id', user.id)

      if (error) throw error
      
      setEditingLeagueId(null)
      setEditNickname('')
      setMessage('Nickname updated successfully!')
      fetchLeagues()
    } catch (error: any) {
      setMessage('Error updating nickname: ' + error.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Image 
              src="/logo.png" 
              alt="RedZone Companion" 
              width={96} 
              height={96} 
              className="flex-shrink-0" 
            />
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">RedZone Companion</h1>
              <p className="text-slate-400">Manage your fantasy leagues and players</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm text-slate-400">Signed in as</div>
              <div className="font-medium text-white">{user.email}</div>
            </div>
            <button
              onClick={onLogout}
              className="btn btn-secondary"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Add League Form */}
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Add Sleeper League</h2>
          <form onSubmit={addLeague} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={newLeagueId}
                onChange={(e) => setNewLeagueId(e.target.value)}
                placeholder="Sleeper League ID"
                className="input flex-1"
                required
              />
              <input
                type="text"
                value={newLeagueNickname}
                onChange={(e) => setNewLeagueNickname(e.target.value)}
                placeholder="Nickname (optional)"
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary px-6"
              >
                {loading ? 'Adding...' : 'Add'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Find League ID: Sleeper App → League → Settings → League ID
            </p>
          </form>
        </div>

        {/* Leagues List */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Leagues</h2>
            <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs font-medium">
              {leagues.length} {leagues.length === 1 ? 'League' : 'Leagues'}
            </span>
          </div>
          
          {leagues.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-2">No leagues added yet</p>
              <p className="text-slate-500 text-sm">Add your first Sleeper league to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leagues.map((league) => (
                <div key={league.id} className="flex justify-between items-center bg-slate-700/50 border border-slate-600 p-4 rounded-lg hover:bg-slate-700/70 transition-colors">
                  <div className="min-w-0 flex-1">
                    {editingLeagueId === league.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          placeholder="Enter nickname (optional)"
                          className="input text-sm flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => saveEditNickname(league.id)}
                          className="btn btn-primary text-xs px-2 py-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditNickname}
                          className="btn btn-secondary text-xs px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white truncate">
                            {league.custom_nickname || league.league_name || 'Unnamed League'}
                          </h3>
                          {league.custom_nickname && (
                            <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {league.custom_nickname ? league.league_name || 'Unnamed League' : `ID: ${league.sleeper_league_id}`}
                        </p>
                      </>
                    )}
                  </div>
                  {editingLeagueId !== league.id && (
                    <div className="flex gap-2 ml-3">
                      <button
                        onClick={() => startEditNickname(league)}
                        className="btn btn-secondary text-xs px-3 py-1.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeLeague(league.id)}
                        className="btn btn-danger text-xs px-3 py-1.5"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start Session Button */}
        {leagues.length > 0 && (
          <div className="mt-12 text-center">
            <button 
              onClick={onStartRedZoneSession}
              className="btn btn-success px-12 py-4 text-xl font-semibold"
            >
              Start RedZone Session
            </button>
            <p className="text-sm text-slate-400 mt-4">
              Launch the main interface to track your players during games
            </p>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div className={`mt-8 p-4 rounded-lg border ${
            message.includes('successfully') 
              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' 
              : 'bg-red-900/50 text-red-300 border-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* User Selector Modal */}
        {pendingLeagueId && (
          <SleeperUserSelector
            leagueId={pendingLeagueId}
            onUserSelect={handleUserSelected}
            onCancel={handleUserSelectionCancel}
          />
        )}
      </div>
    </div>
  )
}