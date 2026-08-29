'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperMatchups,
  fetchSleeperPlayers,
  findUserRoster,
  findOpponentRoster,
  getEffectiveCurrentWeek
} from '@/lib/api'
import { getErrorMessage, isAbortError } from '@/lib/errors'
import { getSleeperPlayerName } from '@/lib/players'
import { UserLeague, SleeperPlayers } from '@/types'

interface AllLeaguesViewProps {
  user: User
  onBackToDashboard: () => void
}

interface StarterPlayer {
  playerId: string
  name: string
  position: string
  team: string
  jerseyNumber: string
}

interface LeagueLineup {
  leagueId: string
  leagueName: string
  userRoster: {
    rosterId: number
    owner: string
    starters: StarterPlayer[]
  }
  opponentRoster: {
    rosterId: number
    owner: string
    starters: StarterPlayer[]
  } | null
  matchupId: number | null
}

export default function AllLeaguesView({ user, onBackToDashboard }: AllLeaguesViewProps) {
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([])
  const [leagueLineups, setLeagueLineups] = useState<LeagueLineup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const fetchLeaguesRequestId = useRef(0)
  const refreshRequestId = useRef(0)
  const refreshController = useRef<AbortController | null>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      fetchLeaguesRequestId.current += 1
      refreshRequestId.current += 1
      refreshController.current?.abort()
    }
  }, [])

  const fetchUserLeagues = useCallback(async () => {
    const requestId = ++fetchLeaguesRequestId.current

    try {
      const { data, error } = await supabase
        .from('user_leagues')
        .select('*')
        .eq('user_id', user.id)

      if (error) throw error
      if (!isMounted.current || requestId !== fetchLeaguesRequestId.current) return

      setUserLeagues(data || [])
    } catch (error: unknown) {
      if (!isMounted.current || requestId !== fetchLeaguesRequestId.current) return

      setError('Error fetching leagues: ' + getErrorMessage(error))
    }
  }, [user.id])

  const fetchAllLeagueLineups = useCallback(async (
    week: number,
    players: SleeperPlayers,
    signal?: AbortSignal
  ): Promise<{ lineups: LeagueLineup[], failureCount: number }> => {
    const results = await Promise.all(userLeagues.map(async (league) => {
      try {
        const leagueId = league.sleeper_league_id
        const leagueName = league.custom_nickname || league.league_name || 'League'

        // Fetch league data in parallel
        const [rosters, users, matchups] = await Promise.all([
          fetchSleeperLeagueRosters(leagueId, signal),
          fetchSleeperLeagueUsers(leagueId, signal),
          fetchSleeperMatchups(leagueId, week, signal)
        ])

        // Find user's roster using stored Sleeper user ID
        const sleeperUserId = league.sleeper_user_id
        if (!sleeperUserId) {
          console.warn(`No Sleeper user ID stored for league ${leagueId}`)
          return null
        }

        const userRoster = findUserRoster(rosters, sleeperUserId)
        if (!userRoster) {
          console.warn(`User roster not found in league ${leagueId}`)
          return null
        }

        // Find user's matchup
        const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id)

        // Find opponent's roster and matchup
        const opponentRoster = findOpponentRoster(rosters, matchups, userRoster.roster_id)
        const opponentMatchup = userMatchup ? matchups.find(m =>
          m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
        ) : null

        // Get user owner name
        const userOwner = users.find(u => u.user_id === userRoster.owner_id)?.display_name || 'You'

        // Get opponent owner name
        const opponentOwner = opponentRoster ?
          users.find(u => u.user_id === opponentRoster.owner_id)?.display_name || 'Opponent' : null

        // Use matchup starters when available (more current than roster)
        const actualUserStarters = userMatchup?.starters || userRoster.starters
        const actualOpponentStarters = opponentMatchup?.starters || opponentRoster?.starters

        // Process user starters
        const userStartersData = actualUserStarters?.map((playerId): StarterPlayer | null => {
          if (playerId && players[playerId]) {
            const player = players[playerId]
            return {
              playerId,
              name: getSleeperPlayerName(player),
              position: player.position || 'N/A',
              team: player.team || 'FA',
              jerseyNumber: player.number?.toString() || ''
            }
          }
          return null
        }).filter((player): player is StarterPlayer => Boolean(player)) || []

        // Process opponent starters
        const opponentStartersData = actualOpponentStarters?.map((playerId): StarterPlayer | null => {
          if (playerId && players[playerId]) {
            const player = players[playerId]
            return {
              playerId,
              name: getSleeperPlayerName(player),
              position: player.position || 'N/A',
              team: player.team || 'FA',
              jerseyNumber: player.number?.toString() || ''
            }
          }
          return null
        }).filter((player): player is StarterPlayer => Boolean(player)) || []

        return {
          leagueId: league.sleeper_league_id,
          leagueName,
          userRoster: {
            rosterId: userRoster.roster_id,
            owner: userOwner,
            starters: userStartersData
          },
          opponentRoster: opponentRoster ? {
            rosterId: opponentRoster.roster_id,
            owner: opponentOwner || 'Opponent',
            starters: opponentStartersData
          } : null,
          matchupId: userMatchup?.matchup_id || null
        } satisfies LeagueLineup
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw error
        }

        console.warn(`Skipping league ${league.sleeper_league_id}:`, error)
        return null
      }
    }))

    return {
      lineups: results.filter((lineup): lineup is LeagueLineup => Boolean(lineup)),
      failureCount: results.filter(result => result === null).length
    }
  }, [userLeagues])

  const refreshData = useCallback(async () => {
    if (userLeagues.length === 0) {
      setError('No leagues configured. Please add leagues first.')
      return
    }

    refreshController.current?.abort()
    const controller = new AbortController()
    refreshController.current = controller
    const requestId = ++refreshRequestId.current

    setLoading(true)
    setError('')

    try {
      // Get current week and players data
      const [week, playersData] = await Promise.all([
        getEffectiveCurrentWeek(controller.signal),
        fetchSleeperPlayers(controller.signal)
      ])

      if (!isMounted.current || requestId !== refreshRequestId.current) return

      setCurrentWeek(week)

      // Fetch lineups for all leagues
      const { lineups, failureCount } = await fetchAllLeagueLineups(week, playersData, controller.signal)

      if (!isMounted.current || requestId !== refreshRequestId.current) return

      setLeagueLineups(lineups)

      if (failureCount > 0) {
        setError(`${failureCount} league${failureCount === 1 ? '' : 's'} could not be loaded. Showing the rest.`)
      }

    } catch (error: unknown) {
      if (!isAbortError(error) && isMounted.current && requestId === refreshRequestId.current) {
        setError('Error fetching data: ' + getErrorMessage(error))
      }
    } finally {
      if (isMounted.current && requestId === refreshRequestId.current) {
        setLoading(false)
      }
    }
  }, [userLeagues.length, fetchAllLeagueLineups])

  // Load user leagues on mount
  useEffect(() => {
    fetchUserLeagues()
  }, [fetchUserLeagues])

  // Auto-refresh when leagues are loaded
  useEffect(() => {
    if (userLeagues.length > 0) {
      refreshData()
    }
  }, [userLeagues.length, refreshData])

  return (
    <div className="space-y-4 text-white">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Week {currentWeek}</p>
          <h1 className="text-2xl font-bold text-white md:text-3xl">All League Lineups</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="btn btn-secondary"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </section>

      {/* Content */}
      <div>
        {loading ? (
          <div className="text-center py-20" role="status" aria-live="polite">
            <div className="text-2xl font-semibold text-slate-300 mb-4">Loading lineups...</div>
            <div className="text-slate-400">Fetching data from all your leagues</div>
          </div>
        ) : leagueLineups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-2xl font-semibold text-slate-300 mb-4">No lineups found</div>
            <div className="text-slate-400 mb-6">Make sure you have leagues configured and try refreshing</div>
            <button
              type="button"
              onClick={refreshData}
              className="btn btn-primary"
            >
              Refresh Data
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {leagueLineups.map((league) => (
              <div key={league.leagueId} className="card p-6">
                <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">
                  {league.leagueName}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* User's Lineup */}
                  <div>
                    <h3 className="text-lg font-semibold text-emerald-400 mb-3">
                      {league.userRoster.owner} (You)
                    </h3>
                    <div className="space-y-2">
                      {league.userRoster.starters.map((player, index) => (
                        <div key={`${player.playerId}-${index}`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img
                                src={player.position === 'DEF' || player.name.includes('Defense')
                                  ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                  : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                                }
                                alt={player.name}
                                className="w-6 h-6 rounded-full object-cover bg-slate-600"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                              <div className="text-sm">
                                {player.jerseyNumber && (
                                  <span className="text-slate-300 font-medium">#{player.jerseyNumber} </span>
                                )}
                                <span className="text-white font-medium">{player.name}</span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 font-medium">
                              {player.position} - {player.team}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Opponent's Lineup */}
                  <div>
                    <h3 className="text-lg font-semibold text-red-400 mb-3">
                      {league.opponentRoster?.owner || 'Bye Week'}
                    </h3>
                    {league.opponentRoster ? (
                      <div className="space-y-2">
                        {league.opponentRoster.starters.map((player, index) => (
                          <div key={`${player.playerId}-${index}`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <img
                                  src={player.position === 'DEF' || player.name.includes('Defense')
                                    ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                    : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                                  }
                                  alt={player.name}
                                  className="w-6 h-6 rounded-full object-cover bg-slate-600"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                                <div className="text-sm">
                                  {player.jerseyNumber && (
                                    <span className="text-slate-300 font-medium">#{player.jerseyNumber} </span>
                                  )}
                                  <span className="text-white font-medium">{player.name}</span>
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 font-medium">
                                {player.position} - {player.team}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        Bye week - no opponent
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-6 right-6 max-w-lg mx-auto bg-red-900/90 backdrop-blur-sm border border-red-700 text-red-100 p-4 rounded-lg shadow-lg" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3">
            <div className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true">!</div>
            <div>{error}</div>
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Close error message"
              className="ml-auto shrink-0 rounded px-3 py-2 text-xs opacity-75 hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
