'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fetchFilteredCurrentWeekGames,
  fetchSleeperLeagueRosters,
  fetchSleeperMatchups,
  fetchSleeperPlayers,
  findUserRoster,
  findOpponentRoster
} from '@/lib/api'
import { ESPNGame, UserLeague, PlayerLineup, SleeperPlayers } from '@/types'
import { storage, GameConfig } from '@/lib/storage'
import { getErrorMessage, isAbortError } from '@/lib/errors'
import { getSleeperPlayerName } from '@/lib/players'
import GameConfigModal from './GameConfigModal'

interface RedZoneViewProps {
  user: User
  onBackToDashboard: () => void
}

export default function RedZoneView({ user, onBackToDashboard }: RedZoneViewProps) {
  const [games, setGames] = useState<ESPNGame[]>(() => storage.getGames() ?? [])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => storage.getSelectedGame())
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([])
  const [playerLineups, setPlayerLineups] = useState<PlayerLineup[]>(() => storage.getPlayerLineups() ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentWeek, setCurrentWeek] = useState(() => storage.getCurrentWeek() ?? 1)
  const [gameConfig, setGameConfig] = useState<GameConfig[]>(() => storage.getGameConfig())
  const [showGameConfig, setShowGameConfig] = useState(false)
  const [hiddenLeagues, setHiddenLeagues] = useState<Set<string>>(() => new Set(storage.getHiddenLeagues()))
  const [showLeagueFilter, setShowLeagueFilter] = useState(false)
  const fetchLeaguesRequestId = useRef(0)
  const refreshRequestId = useRef(0)
  const refreshController = useRef<AbortController | null>(null)
  const isMounted = useRef(true)
  
  useEffect(() => {
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

  const fetchAllLineups = useCallback(async (
    week: number,
    players: SleeperPlayers,
    signal?: AbortSignal
  ): Promise<{ lineups: PlayerLineup[], failureCount: number }> => {
    type PlayerLineupEntry = Omit<PlayerLineup, 'leagueIds' | 'leagueNames'> & {
      leagueId: string
      leagueName: string
    }

    const leagueResults = await Promise.all(userLeagues.map(async (league) => {
      try {
        const leagueId = league.sleeper_league_id

        // Fetch league data in parallel
        const [rosters, matchups] = await Promise.all([
          fetchSleeperLeagueRosters(leagueId, signal),
          fetchSleeperMatchups(leagueId, week, signal)
        ])

        // Find user's roster using stored Sleeper user ID
        const sleeperUserId = league.sleeper_user_id
        if (!sleeperUserId) {
          console.warn(`No Sleeper user ID stored for league ${leagueId}. Please re-add this league with user selection.`)
          return null
        }

        const userRoster = findUserRoster(rosters, sleeperUserId)
        if (!userRoster) {
          console.warn(`User roster not found in league ${leagueId} for Sleeper user ${sleeperUserId}`)
          return null
        }

        // Find user's matchup to see if it has different starters
        const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id)

        // Find opponent's roster
        const opponentRoster = findOpponentRoster(rosters, matchups, userRoster.roster_id)

        // Always use matchup starters when available (more current than roster)
        const actualUserStarters = userMatchup?.starters || userRoster.starters
        const leagueName = league.custom_nickname || league.league_name || 'League'
        const entries: PlayerLineupEntry[] = []

        // Add user's starters to lineup
        if (actualUserStarters) {
          for (const playerId of actualUserStarters) {
            if (playerId && players[playerId]) {
              const player = players[playerId]
              entries.push({
                playerId,
                name: getSleeperPlayerName(player),
                position: player.position || 'N/A',
                team: player.team || 'FA',
                jerseyNumber: player.number?.toString() || '',
                leagueId: league.sleeper_league_id,
                leagueName,
                isOpponent: false
              })
            }
          }
        }

        // Find opponent's matchup for more accurate starters
        const opponentMatchup = userMatchup ? matchups.find(m =>
          m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
        ) : null

        // Always use opponent matchup starters when available (more current than roster)
        const actualOpponentStarters = opponentMatchup?.starters || opponentRoster?.starters

        // Add opponent's starters to lineup
        if (actualOpponentStarters) {
          for (const playerId of actualOpponentStarters) {
            if (playerId && players[playerId]) {
              const player = players[playerId]
              entries.push({
                playerId,
                name: getSleeperPlayerName(player),
                position: player.position || 'N/A',
                team: player.team || 'FA',
                jerseyNumber: player.number?.toString() || '',
                leagueId: league.sleeper_league_id,
                leagueName,
                isOpponent: true
              })
            }
          }
        }

        return entries
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw error
        }

        console.warn(`Skipping league ${league.sleeper_league_id}:`, error)
        return null
      }
    }))

    const allLineups: PlayerLineup[] = []
    const allEntries = leagueResults.flatMap(result => result ?? [])

    for (const entry of allEntries) {
      const existingPlayer = allLineups.find(player =>
        player.playerId === entry.playerId &&
        player.isOpponent === entry.isOpponent &&
        player.team === entry.team
      )

      if (existingPlayer) {
        existingPlayer.leagueIds.push(entry.leagueId)
        existingPlayer.leagueNames.push(entry.leagueName)
      } else {
        allLineups.push({
          playerId: entry.playerId,
          name: entry.name,
          position: entry.position,
          team: entry.team,
          jerseyNumber: entry.jerseyNumber,
          isOpponent: entry.isOpponent,
          leagueIds: [entry.leagueId],
          leagueNames: [entry.leagueName]
        })
      }
    }

    return {
      lineups: allLineups,
      failureCount: leagueResults.filter(result => result === null).length
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
      // Fetch filtered current week games and players data in parallel
      const [filteredGamesData, playersData] = await Promise.all([
        fetchFilteredCurrentWeekGames(controller.signal),
        fetchSleeperPlayers(controller.signal)
      ])

      if (!isMounted.current || requestId !== refreshRequestId.current) return

      setGames(filteredGamesData.events)
      setCurrentWeek(filteredGamesData.week.number)

      // Cache the data
      storage.setGames(filteredGamesData.events)
      storage.setCurrentWeek(filteredGamesData.week.number)
      // Note: Sleeper players will be cached as compact data in fetchAllLineups

      // Fetch lineups for all user leagues
      const { lineups, failureCount } = await fetchAllLineups(filteredGamesData.week.number, playersData, controller.signal)

      if (!isMounted.current || requestId !== refreshRequestId.current) return

      setPlayerLineups(lineups)
      storage.setPlayerLineups(lineups)

      const allPlayerIds = Array.from(new Set(lineups.map(player => player.playerId)))
      storage.setCompactSleeperPlayers(playersData, allPlayerIds)

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
  }, [userLeagues.length, fetchAllLineups])

  // Memoized game filtering to avoid recalculation on every render
  const filteredGames = useMemo(() => {
    if (games.length === 0) return []
    if (gameConfig.length === 0) return games

    // Apply configuration
    const configMap = new Map(gameConfig.map(c => [c.gameId, c]))

    return games
      .map(game => ({
        game,
        config: configMap.get(game.id) || { gameId: game.id, isVisible: true, customOrder: games.indexOf(game) }
      }))
      .filter(({ config }) => config.isVisible)
      .sort((a, b) => a.config.customOrder - b.config.customOrder)
      .map(({ game }) => game)
  }, [games, gameConfig])

  // Load user leagues on mount and drop expired local cache entries.
  useEffect(() => {
    fetchUserLeagues()
    storage.clearExpired()
  }, [fetchUserLeagues])

  // Keyboard navigation for game selection only
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )

      if (isTyping || e.altKey || e.ctrlKey || e.metaKey) return

      const key = e.key

      // Game selection (1-9, A-Z)
      if (key >= '1' && key <= '9') {
        const gameIndex = parseInt(key) - 1
        if (gameIndex < filteredGames.length) {
          const gameId = filteredGames[gameIndex].id
          setSelectedGameId(gameId)
          storage.setSelectedGame(gameId)
        }
      } else if (key.toLowerCase() >= 'a' && key.toLowerCase() <= 'z') {
        const gameIndex = 9 + (key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0))
        if (gameIndex < filteredGames.length) {
          const gameId = filteredGames[gameIndex].id
          setSelectedGameId(gameId)
          storage.setSelectedGame(gameId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [filteredGames])

  // Close league filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showLeagueFilter && !(e.target as Element)?.closest('.relative')) {
        setShowLeagueFilter(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLeagueFilter])

  const handleGameConfigSave = useCallback((newConfig: GameConfig[]) => {
    setGameConfig(newConfig)
    storage.setGameConfig(newConfig)
  }, [])

  const handleGameClick = useCallback((gameId: string) => {
    setSelectedGameId(gameId)
    storage.setSelectedGame(gameId)
  }, [])

  const getKeyboardLabel = (index: number): string => {
    if (index < 9) {
      return (index + 1).toString()
    } else {
      return String.fromCharCode('A'.charCodeAt(0) + index - 9)
    }
  }

  // Memoized unique leagues calculation
  const uniqueLeagues = useMemo((): Array<{id: string, name: string}> => {
    const leagueMap = new Map<string, string>()

    playerLineups.forEach(player => {
      player.leagueIds.forEach((leagueId, index) => {
        const leagueName = player.leagueNames[index]
        leagueMap.set(leagueId, leagueName)
      })
    })

    return Array.from(leagueMap.entries()).map(([id, name]) => ({ id, name }))
  }, [playerLineups])

  const toggleLeagueVisibility = useCallback((leagueId: string) => {
    setHiddenLeagues(prev => {
      const newSet = new Set(prev)
      if (newSet.has(leagueId)) {
        newSet.delete(leagueId)
      } else {
        newSet.add(leagueId)
      }

      // Persist to storage
      const leagueArray = Array.from(newSet)
      storage.setHiddenLeagues(leagueArray)

      return newSet
    })
  }, [])

  // Memoized function to get players for a specific game - optimized for performance
  const getPlayersForGame = useMemo(() => {
    // Create a map of team abbreviations to players for faster lookup
    const teamPlayerMap = new Map<string, { myPlayers: PlayerLineup[], opponents: PlayerLineup[] }>()

    // Pre-filter visible players once instead of per game
    const visiblePlayers = playerLineups.filter(player =>
      player.leagueIds.some(leagueId => !hiddenLeagues.has(leagueId))
    )

    // Helper to normalize team names/abbreviations
    const normalizeTeam = (team: string) => {
      if (!team) return team;
      const t = team.trim().toUpperCase();
      if (t === 'WASHINGTON COMMANDERS' || t === 'WASHINGTON FOOTBALL TEAM' || t === 'WAS' || t === 'WSH') return 'WSH';
      return t;
    };

    // ...

    // Process each visible player once and group by normalized team
    for (const player of visiblePlayers) {
      // Filter out hidden leagues from the player's data
      const visibleLeagueIndices = player.leagueIds
        .map((leagueId, index) => ({ leagueId, index }))
        .filter(({ leagueId }) => !hiddenLeagues.has(leagueId));

      const filteredPlayer = {
        ...player,
        leagueIds: visibleLeagueIndices.map(({ leagueId }) => leagueId),
        leagueNames: visibleLeagueIndices.map(({ index }) => player.leagueNames[index])
      };

      const normalizedTeam = normalizeTeam(player.team);
      if (!teamPlayerMap.has(normalizedTeam)) {
        teamPlayerMap.set(normalizedTeam, { myPlayers: [], opponents: [] });
      }

      const teamData = teamPlayerMap.get(normalizedTeam)!;
      if (player.isOpponent) {
        teamData.opponents.push(filteredPlayer);
      } else {
        teamData.myPlayers.push(filteredPlayer);
      }
    }

    // ...

    // Return optimized lookup function
    return (game: ESPNGame) => {
      if (!game.competitions[0]) return { homeTeam: { myPlayers: [], opponents: [] }, awayTeam: { myPlayers: [], opponents: [] } };

      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === 'home');
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === 'away');

      const homeTeamAbbr = homeTeam?.team.abbreviation || '';
      const awayTeamAbbr = awayTeam?.team.abbreviation || '';

      return {
        homeTeam: teamPlayerMap.get(homeTeamAbbr) || { myPlayers: [], opponents: [] },
        awayTeam: teamPlayerMap.get(awayTeamAbbr) || { myPlayers: [], opponents: [] }
      };
    }
  }, [playerLineups, hiddenLeagues])

  // Memoized selected game and players calculation to avoid unnecessary recalculations
  // IMPORTANT: Must be before any conditional returns to maintain hook order
  const selectedGame = useMemo(() =>
    selectedGameId !== null ? filteredGames.find(game => game.id === selectedGameId) ?? null : null,
    [selectedGameId, filteredGames]
  )

  const selectedGamePlayers = useMemo(() =>
    selectedGame ? getPlayersForGame(selectedGame) : null,
    [selectedGame, getPlayersForGame]
  )

  // Early return for empty state - after all hooks are called
  if (filteredGames.length === 0 && !loading) {
    return (
      <div className="space-y-4 text-white">
        <section className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">RedZone</p>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Games</h1>
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

        <div className="container mx-auto px-6 py-20">
          <div className="text-center max-w-lg mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-6">Ready to Track Your Players</h2>
            <p className="text-slate-400 text-lg mb-8">Click Refresh Data to load current week games and your active lineups</p>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <p className="text-sm text-slate-500">Make sure you have leagues configured in your dashboard first</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="fixed bottom-6 left-6 right-6 max-w-lg mx-auto bg-red-900/90 backdrop-blur-sm border border-red-700 text-red-100 p-4 rounded-lg shadow-lg" role="alert" aria-live="assertive">
            <div className="flex items-start gap-3">
              <div className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true">!</div>
              <div>{error}</div>
              <button
                type="button"
                onClick={() => {
                  setError('')
                }}
                aria-label="Close error message"
                className="ml-auto text-xs opacity-75 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 text-white">
      {/* Header with Controls */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="btn btn-secondary"
            >
              Dashboard
            </button>
            <div className="lg:text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Week {currentWeek}</p>
              <h1 className="text-2xl font-bold text-white md:text-3xl">RedZone Games</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={refreshData}
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLeagueFilter(!showLeagueFilter)}
                  aria-expanded={showLeagueFilter}
                  aria-controls="league-filter-menu"
                  className="btn btn-secondary"
                >
                  Filter Leagues
                </button>
                {showLeagueFilter && (
                  <div id="league-filter-menu" className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[240px]">
                    <div className="p-3 border-b border-slate-700">
                      <h3 className="font-semibold text-white text-sm">League Visibility</h3>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {uniqueLeagues.map(league => (
                        <button
                          key={league.id}
                          type="button"
                          onClick={() => toggleLeagueVisibility(league.id)}
                          aria-pressed={!hiddenLeagues.has(league.id)}
                          className="w-full text-left px-3 py-3 hover:bg-slate-700 transition-colors flex items-center justify-between group"
                        >
                          <span className="text-sm text-white truncate">{league.name}</span>
                          <div className={`w-4 h-4 rounded border ${
                            hiddenLeagues.has(league.id)
                              ? 'bg-slate-600 border-slate-500'
                              : 'bg-blue-500 border-blue-400'
                          } flex items-center justify-center`}>
                            {!hiddenLeagues.has(league.id) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </button>
                      ))}
                      {uniqueLeagues.length === 0 && (
                        <div className="px-3 py-4 text-center text-slate-400 text-sm">
                          No leagues found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowGameConfig(true)}
                className="btn btn-secondary"
              >
                Configure Games
              </button>
            </div>
          </div>

          {/* Games Header */}
          <div className="flex flex-wrap gap-2 justify-center max-w-6xl mx-auto px-2">
            {filteredGames.map((game, index) => {
              const homeTeam = game.competitions[0]?.competitors.find(c => c.homeAway === 'home')
              const awayTeam = game.competitions[0]?.competitors.find(c => c.homeAway === 'away')
              const isSelected = selectedGame?.id === game.id

              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => handleGameClick(game.id)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${awayTeam?.team.abbreviation || 'away team'} at ${homeTeam?.team.abbreviation || 'home team'}`}
                  className={`px-1 py-3 rounded-lg text-sm font-medium transition-all border min-w-[110px] ${
                    isSelected 
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/25' 
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold text-center mb-1 opacity-75">{getKeyboardLabel(index)}</div>
                  <div className="flex items-center justify-center gap-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      {awayTeam?.team?.logo && (
                        <img src={awayTeam.team.logo} alt={awayTeam.team.abbreviation} className="w-4 h-4" />
                      )}
                      <span className="font-medium">{awayTeam?.team.abbreviation}</span>
                    </div>
                    <span className="opacity-75 font-medium text-xs">@</span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{homeTeam?.team.abbreviation}</span>
                      {homeTeam?.team?.logo && (
                        <img src={homeTeam.team.logo} alt={homeTeam.team.abbreviation} className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto p-2 md:p-4">
        {selectedGame && selectedGamePlayers ? (
          <div>
            {/* Game Header */}
            <div className="text-center mb-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-3 max-w-4xl mx-auto">
                {(() => {
                  const awayTeamData = selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'away')
                  const homeTeamData = selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'home')
                  const awayRecord = awayTeamData?.records?.find(r => r.type === 'total')?.summary
                  const homeRecord = homeTeamData?.records?.find(r => r.type === 'total')?.summary
                  const venue = selectedGame.competitions[0]?.venue?.fullName
                  const weather = selectedGame.weather
                  return (
                    <>
                      <div className="flex items-start gap-3 flex-1 justify-center md:justify-end">
                        {awayTeamData?.team?.logo && (
                          <img src={awayTeamData.team.logo} alt={awayTeamData.team.displayName} className="w-10 h-10" style={{marginTop: '-5px'}} />
                        )}
                        <div className="text-center md:text-right">
                          <h2 className="text-xl font-bold text-white md:text-2xl">{awayTeamData?.team.displayName}</h2>
                          {awayRecord && <div className="text-xs text-slate-400">({awayRecord})</div>}
                        </div>
                      </div>
                      <div className="flex flex-col items-center px-2 md:min-w-[160px] md:px-6">
                        <div className="text-xs text-slate-400 text-center space-y-0.5">
                          <div>{new Date(selectedGame.date).toLocaleTimeString()}</div>
                          {venue && <div className="truncate max-w-[140px]" title={venue}>{venue}</div>}
                          {weather && (
                            <div className={`${
                              weather.displayValue?.toLowerCase().includes('rain') ||
                              weather.displayValue?.toLowerCase().includes('snow') ||
                              weather.displayValue?.toLowerCase().includes('wind') ||
                              (weather.temperature && weather.temperature < 32) ||
                              (weather.temperature && weather.temperature > 90)
                                ? 'text-orange-300 font-medium' 
                                : ''
                            }`}>
                              {weather.displayValue}
                              {weather.temperature && `, ${weather.temperature}°F`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3 flex-1 justify-center md:justify-start">
                        <div className="text-center md:text-left">
                          <h2 className="text-xl font-bold text-white md:text-2xl">{homeTeamData?.team.displayName}</h2>
                          {homeRecord && <div className="text-xs text-slate-400">({homeRecord})</div>}
                        </div>
                        {homeTeamData?.team?.logo && (
                          <img src={homeTeamData.team.logo} alt={homeTeamData.team.displayName} className="w-10 h-10" style={{marginTop: '-5px'}} />
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Responsive Layout - 4 columns on desktop, 2 on tablet, 1 on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Away Team - My Players */}
              <div className="card p-4">
                <h3 className="text-base font-semibold text-emerald-400 mb-4 border-b border-slate-700 pb-2">
                  {selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'away')?.team.abbreviation} - My Players
                </h3>
                {selectedGamePlayers.awayTeam.myPlayers.length === 0 ? (
                  <p className="text-slate-500 text-center py-4 text-sm">No players</p>
                ) : (
                  <div className="space-y-1">
                    {selectedGamePlayers.awayTeam.myPlayers.map(player => (
                      <div key={`${player.playerId}-away-mine`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={player.position === 'DEF' || player.name.includes('Defense')
                                ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                              }
                              alt={player.name}
                              className="w-6 h-6 rounded-full object-cover bg-slate-600 flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                            <div className="font-bold text-white text-lg">
                              {player.jerseyNumber && (
                                <span className="text-slate-300 font-bold text-lg">#{player.jerseyNumber} </span>
                              )}
                              {player.name.length > 15 ? player.name.split(' ').pop() || player.name : player.name}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">{player.position}</div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {player.leagueNames.map((leagueName, index) => (
                            <div key={index} className="bg-blue-800/60 text-blue-200 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-20">{leagueName.substring(0, 8)}{leagueName.length > 8 ? '...' : ''}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Away Team - Against Me */}
              <div className="card p-4">
                <h3 className="text-base font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">
                  {selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'away')?.team.abbreviation} - Against Me
                </h3>
                {selectedGamePlayers.awayTeam.opponents.length === 0 ? (
                  <p className="text-slate-500 text-center py-4 text-sm">No players</p>
                ) : (
                  <div className="space-y-1">
                    {selectedGamePlayers.awayTeam.opponents.map(player => (
                      <div key={`${player.playerId}-away-opp`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={player.position === 'DEF' || player.name.includes('Defense')
                                ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                              }
                              alt={player.name}
                              className="w-6 h-6 rounded-full object-cover bg-slate-600 flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                            <div className="font-bold text-white text-lg">
                              {player.jerseyNumber && (
                                <span className="text-slate-300 font-bold text-lg">#{player.jerseyNumber} </span>
                              )}
{player.name.length > 15 ? player.name.split(' ').pop() || player.name : player.name}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">{player.position}</div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {player.leagueNames.map((leagueName, index) => (
                            <div key={index} className="bg-red-800/60 text-red-200 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-20">{leagueName.substring(0, 8)}{leagueName.length > 8 ? '...' : ''}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Home Team - My Players */}
              <div className="card p-4">
                <h3 className="text-base font-semibold text-emerald-400 mb-4 border-b border-slate-700 pb-2">
                  {selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'home')?.team.abbreviation} - My Players
                </h3>
                {selectedGamePlayers.homeTeam.myPlayers.length === 0 ? (
                  <p className="text-slate-500 text-center py-4 text-sm">No players</p>
                ) : (
                  <div className="space-y-1">
                    {selectedGamePlayers.homeTeam.myPlayers.map(player => (
                      <div key={`${player.playerId}-home-mine`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={player.position === 'DEF' || player.name.includes('Defense')
                                ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                              }
                              alt={player.name}
                              className="w-6 h-6 rounded-full object-cover bg-slate-600 flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                            <div className="font-bold text-white text-lg">
                              {player.jerseyNumber && (
                                <span className="text-slate-300 font-bold text-lg">#{player.jerseyNumber} </span>
                              )}
{player.name.length > 15 ? player.name.split(' ').pop() || player.name : player.name}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">{player.position}</div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {player.leagueNames.map((leagueName, index) => (
                            <div key={index} className="bg-blue-800/60 text-blue-200 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-20">{leagueName.substring(0, 8)}{leagueName.length > 8 ? '...' : ''}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Home Team - Against Me */}
              <div className="card p-4">
                <h3 className="text-base font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">
                  {selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'home')?.team.abbreviation} - Against Me
                </h3>
                {selectedGamePlayers.homeTeam.opponents.length === 0 ? (
                  <p className="text-slate-500 text-center py-4 text-sm">No players</p>
                ) : (
                  <div className="space-y-1">
                    {selectedGamePlayers.homeTeam.opponents.map(player => (
                      <div key={`${player.playerId}-home-opp`} className="bg-slate-700/30 border border-slate-600/50 p-2 rounded hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={player.position === 'DEF' || player.name.includes('Defense')
                                ? `https://sleepercdn.com/images/team_logos/nfl/${player.team.toLowerCase()}.png`
                                : `https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`
                              }
                              alt={player.name}
                              className="w-6 h-6 rounded-full object-cover bg-slate-600 flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                            <div className="font-bold text-white text-lg">
                              {player.jerseyNumber && (
                                <span className="text-slate-300 font-bold text-lg">#{player.jerseyNumber} </span>
                              )}
{player.name.length > 15 ? player.name.split(' ').pop() || player.name : player.name}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">{player.position}</div>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {player.leagueNames.map((leagueName, index) => (
                            <div key={index} className="bg-red-800/60 text-red-200 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-20">{leagueName.substring(0, 8)}{leagueName.length > 8 ? '...' : ''}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="max-w-md mx-auto">
              <h3 className="text-2xl font-semibold text-slate-300 mb-4">Select a Game</h3>
              <p className="text-slate-400 text-lg mb-2">Choose a game from the header to view your players</p>
              <p className="text-sm text-slate-500">Use keyboard numbers 1-9 or letters A-Z for quick navigation</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="fixed bottom-6 left-6 right-6 max-w-lg mx-auto backdrop-blur-sm p-4 rounded-lg shadow-lg bg-red-900/90 border border-red-700 text-red-100" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5 text-red-400" aria-hidden="true">!</div>
            <div>{error}</div>
            <button
              type="button"
              onClick={() => {
                setError('')
              }}
              aria-label="Close error message"
              className="ml-auto text-xs opacity-75 hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Game Configuration Modal */}
      {showGameConfig && (
        <GameConfigModal
          games={games}
          gameConfig={gameConfig}
          onClose={() => setShowGameConfig(false)}
          onSave={handleGameConfigSave}
        />
      )}

      {/* Removed temporary user selector modal - using permanent database solution */}
    </div>
  )
}
