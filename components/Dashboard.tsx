'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/storage'
import { UserLeague } from '@/types'
import { fetchSleeperLeague, isSleeperLeagueId } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import SleeperUserSelector from './SleeperUserSelector'

interface DashboardProps {
  user: User
  onStartRedZoneSession: () => void
  onViewAllLeagues: () => void
}

export default function Dashboard({ user, onStartRedZoneSession, onViewAllLeagues }: DashboardProps) {
  const [leagues, setLeagues] = useState<UserLeague[]>(() =>
    storage.getUserLeagues()?.filter(league => league.user_id === user.id) ?? []
  )
  const [newLeagueId, setNewLeagueId] = useState('')
  const [newLeagueNickname, setNewLeagueNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingLeagueId, setPendingLeagueId] = useState<string | null>(null)
  const [editingLeagueId, setEditingLeagueId] = useState<number | null>(null)
  const [editNickname, setEditNickname] = useState('')
  const fetchLeaguesRequestId = useRef(0)
  const addLeagueInFlight = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
      fetchLeaguesRequestId.current += 1
      addLeagueInFlight.current = false
    }
  }, [])

  const fetchLeagues = useCallback(async () => {
    const requestId = ++fetchLeaguesRequestId.current

    try {
      const { data, error } = await supabase
        .from('user_leagues')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!isMounted.current || requestId !== fetchLeaguesRequestId.current) return
      
      const leagues = data || []
      setLeagues(leagues)
      
      // Cache the leagues data
      storage.setUserLeagues(leagues)
    } catch (error: unknown) {
      if (!isMounted.current || requestId !== fetchLeaguesRequestId.current) return

      setMessage('Error fetching leagues: ' + getErrorMessage(error))
    }
  }, [user.id])

  useEffect(() => {
    // Always fetch fresh data but don't block UI
    fetchLeagues()
  }, [fetchLeagues])

  const addLeague = async (e: React.FormEvent) => {
    e.preventDefault()
    const leagueId = newLeagueId.trim()
    if (!leagueId) return

    if (!isSleeperLeagueId(leagueId)) {
      setMessage('Sleeper League ID should contain only numbers.')
      return
    }

    // Check if league already exists
    const existingLeague = leagues.find(l => l.sleeper_league_id === leagueId)
    if (existingLeague) {
      setMessage(`League "${existingLeague.league_name || 'Unnamed League'}" is already added!`)
      return
    }

    // Show user selector for this league
    setPendingLeagueId(leagueId)
  }

  const handleUserSelected = async (sleeperUserId: string, displayName: string) => {
    if (!pendingLeagueId || addLeagueInFlight.current) return

    addLeagueInFlight.current = true
    setLoading(true)
    setMessage('')
    const leagueId = pendingLeagueId
    const nickname = newLeagueNickname.trim()

    try {
      // Fetch the actual league name from Sleeper
      const leagueData = await fetchSleeperLeague(leagueId)
      const leagueName = leagueData.name || `League ${leagueId}`

      if (!isMounted.current) return

      const { error } = await supabase
        .from('user_leagues')
        .insert({
          user_id: user.id,
          sleeper_league_id: leagueId,
          sleeper_user_id: sleeperUserId,
          league_name: leagueName,
          custom_nickname: nickname || null,
        })

      if (error) throw error
      if (!isMounted.current) return
      
      setNewLeagueId('')
      setNewLeagueNickname('')
      setPendingLeagueId(null)
      const displayLeagueName = nickname || leagueName
      setMessage(`League "${displayLeagueName}" added successfully! You are: ${displayName}`)
      fetchLeagues()
    } catch (error: unknown) {
      setMessage('Error adding league: ' + getErrorMessage(error))
    } finally {
      addLeagueInFlight.current = false
      if (isMounted.current) {
        setLoading(false)
      }
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
    } catch (error: unknown) {
      setMessage('Error removing league: ' + getErrorMessage(error))
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
    } catch (error: unknown) {
      setMessage('Error updating nickname: ' + getErrorMessage(error))
    }
  }

  return (
    <div className="space-y-6 text-white">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Dashboard</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">League Control Center</h1>
          <p className="mt-1 text-sm text-slate-400">{user.email}</p>
        </div>

        {leagues.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onStartRedZoneSession}
              className="btn btn-success px-6 py-3 text-base font-semibold"
            >
              Start RedZone
            </button>
            <button
              type="button"
              onClick={onViewAllLeagues}
              className="btn btn-primary px-6 py-3 text-base font-semibold"
            >
              All Lineups
            </button>
          </div>
        )}
      </section>

        {/* Add League Form */}
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Add Sleeper League</h2>
          <form onSubmit={addLeague} className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_auto]">
              <div>
                <label htmlFor="sleeper-league-id" className="mb-2 block text-sm font-medium text-slate-300">
                  Sleeper League ID
                </label>
                <input
                  id="sleeper-league-id"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={newLeagueId}
                  onChange={(e) => setNewLeagueId(e.target.value)}
                  placeholder="123456789"
                  className="input"
                  required
                />
              </div>
              <div>
                <label htmlFor="league-nickname" className="mb-2 block text-sm font-medium text-slate-300">
                  Nickname
                </label>
                <input
                  id="league-nickname"
                  type="text"
                  autoComplete="off"
                  value={newLeagueNickname}
                  onChange={(e) => setNewLeagueNickname(e.target.value)}
                  placeholder="Optional"
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary self-end px-6 py-3"
              >
                {loading ? 'Adding...' : 'Add'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Find League ID: Sleeper App / League / Settings / League ID
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
                <div key={league.id} className="flex flex-col gap-3 bg-slate-700/50 border border-slate-600 p-4 rounded-lg hover:bg-slate-700/70 transition-colors sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {editingLeagueId === league.id ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                        <label htmlFor={`league-nickname-${league.id}`} className="sr-only">
                          League nickname
                        </label>
                        <input
                          id={`league-nickname-${league.id}`}
                          type="text"
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          placeholder="Enter nickname (optional)"
                          className="input text-sm flex-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => saveEditNickname(league.id)}
                          className="btn btn-primary text-xs px-2 py-1"
                        >
                          Save
                        </button>
                        <button
                          type="button"
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
                    <div className="flex gap-2 sm:ml-3">
                      <button
                        type="button"
                        onClick={() => startEditNickname(league)}
                        aria-label={`Edit ${league.custom_nickname || league.league_name || 'league'}`}
                        className="btn btn-secondary text-xs px-3 py-1.5"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLeague(league.id)}
                        aria-label={`Remove ${league.custom_nickname || league.league_name || 'league'}`}
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

        {/* Messages */}
        {message && (
          <div className={`mt-8 p-4 rounded-lg border ${
            message.includes('successfully') 
              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' 
              : 'bg-red-900/50 text-red-300 border-red-700'
          }`}
            role={message.includes('successfully') ? 'status' : 'alert'}
            aria-live={message.includes('successfully') ? 'polite' : 'assertive'}
          >
            {message}
          </div>
        )}

        {/* User Selector Modal */}
        {pendingLeagueId && (
          <SleeperUserSelector
            leagueId={pendingLeagueId}
            disabled={loading}
            onUserSelect={handleUserSelected}
            onCancel={handleUserSelectionCancel}
          />
        )}
    </div>
  )
}
