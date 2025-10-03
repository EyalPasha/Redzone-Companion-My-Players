'use client'

import { useState, useEffect, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fetchSleeperNFLState,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperMatchups,
  fetchSleeperPlayers,
  findUserRoster,
  findOpponentRoster,
  getEffectiveCurrentWeek
} from '@/lib/api'
import { UserLeague, SleeperRoster, SleeperUser, SleeperMatchup } from '@/types'

interface AllLeaguesViewProps {
  user: User
  onBackToDashboard: () => void
}

interface LeagueLineup {
  leagueId: string
  leagueName: string
  userRoster: {
    rosterId: number
    owner: string
    starters: Array<{
      playerId: string
      name: string
      position: string
      team: string
      jerseyNumber: string
    }>
  }
  opponentRoster: {
    rosterId: number
    owner: string
    starters: Array<{
      playerId: string
      name: string
      position: string
      team: string
      jerseyNumber: string
    }>
  } | null
  matchupId: number | null
}

export default function AllLeaguesView({ user, onBackToDashboard }: AllLeaguesViewProps) {
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([])
  const [leagueLineups, setLeagueLineups] = useState<LeagueLineup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const [sleeperPlayers, setSleeperPlayers] = useState<Record<string, any>>({})

  const fetchUserLeagues = async () => {
    try {
      const { data, error } = await supabase
        .from('user_leagues')
        .select('*')
        .eq('user_id', user.id)

      if (error) throw error
      setUserLeagues(data || [])
    } catch (error: any) {
      setError('Error fetching leagues: ' + error.message)
    }
  }

  const fetchAllLeagueLineups = useCallback(async (week: number, players: Record<string, any>) => {
    const allLineups: LeagueLineup[] = []

    try {
      for (const league of userLeagues) {
        const leagueId = league.sleeper_league_id
        const leagueName = league.custom_nickname || league.league_name || 'League'

        // Fetch league data in parallel
        const [rosters, users, matchups] = await Promise.all([
          fetchSleeperLeagueRosters(leagueId),
          fetchSleeperLeagueUsers(leagueId),
          fetchSleeperMatchups(leagueId, week)
        ])

        // Find user's roster using stored Sleeper user ID
        const sleeperUserId = league.sleeper_user_id
        if (!sleeperUserId) {
          console.warn(`No Sleeper user ID stored for league ${leagueId}`)
          continue
        }

        const userRoster = findUserRoster(rosters, sleeperUserId)
        if (!userRoster) {
          console.warn(`User roster not found in league ${leagueId}`)
          continue
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
        const userStartersData = actualUserStarters?.map(playerId => {
          if (playerId && players[playerId]) {
            const player = players[playerId]
            return {
              playerId,
              name: `${player.first_name} ${player.last_name}`,
              position: player.position || 'N/A',
              team: player.team || 'FA',
              jerseyNumber: player.number?.toString() || ''
            }
          }
          return null
        }).filter(Boolean) || []

        // Process opponent starters
        const opponentStartersData = actualOpponentStarters?.map(playerId => {
          if (playerId && players[playerId]) {
            const player = players[playerId]
            return {
              playerId,
              name: `${player.first_name} ${player.last_name}`,
              position: player.position || 'N/A',
              team: player.team || 'FA',
              jerseyNumber: player.number?.toString() || ''
            }
          }
          return null
        }).filter(Boolean) || []

        allLineups.push({
          leagueId: league.sleeper_league_id,
          leagueName,
          userRoster: {
            rosterId: userRoster.roster_id,
            owner: userOwner,
            starters: userStartersData as any
          },
          opponentRoster: opponentRoster ? {
            rosterId: opponentRoster.roster_id,
            owner: opponentOwner || 'Opponent',
            starters: opponentStartersData as any
          } : null,
          matchupId: userMatchup?.matchup_id || null
        })
      }

      setLeagueLineups(allLineups)

    } catch (error: any) {
      setError('Error fetching league lineups: ' + error.message)
    }
  }, [userLeagues])

  const refreshData = useCallback(async () => {
    if (userLeagues.length === 0) {
      setError('No leagues configured. Please add leagues first.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Get current week and players data
      const [week, playersData] = await Promise.all([
        getEffectiveCurrentWeek(),
        fetchSleeperPlayers()
      ])

      setCurrentWeek(week)
      setSleeperPlayers(playersData)

      // Fetch lineups for all leagues
      await fetchAllLeagueLineups(week, playersData)

    } catch (error: any) {
      setError('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [userLeagues.length, fetchAllLeagueLineups])

  // Load user leagues on mount
  useEffect(() => {
    fetchUserLeagues()
  }, [])

  // Auto-refresh when leagues are loaded
  useEffect(() => {
    if (userLeagues.length > 0) {
      refreshData()
    }
  }, [userLeagues.length, refreshData])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="container mx-auto">
          <div className="flex justify-between items-center">
            <button
              onClick={onBackToDashboard}
              className="btn btn-secondary"
            >
              ← Back to Dashboard
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-bold">All League Lineups</h1>
              <p className="text-sm text-slate-400 mt-1">Week {currentWeek}</p>
            </div>
            <button
              onClick={refreshData}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Loading...' : 'Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-4">
        {loading ? (
          <div className="text-center py-20">
            <div className="text-2xl font-semibold text-slate-300 mb-4">Loading lineups...</div>
            <div className="text-slate-400">Fetching data from all your leagues</div>
          </div>
        ) : leagueLineups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-2xl font-semibold text-slate-300 mb-4">No lineups found</div>
            <div className="text-slate-400 mb-6">Make sure you have leagues configured and try refreshing</div>
            <button
              onClick={refreshData}
              className="btn btn-primary"
            >
              Refresh Data
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                {/* Matchup Info */}
                {league.matchupId && (
                  <div className="mt-4 pt-3 border-t border-slate-700 text-center text-xs text-slate-400">
                    Matchup ID: {league.matchupId}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-6 right-6 max-w-lg mx-auto bg-red-900/90 backdrop-blur-sm border border-red-700 text-red-100 p-4 rounded-lg shadow-lg">
          <div className="flex items-start gap-3">
            <div className="text-red-400 flex-shrink-0 mt-0.5">⚠</div>
            <div>{error}</div>
            <button
              onClick={() => setError('')}
              className="ml-auto text-xs opacity-75 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}