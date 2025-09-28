'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fetchFilteredCurrentWeekGames,
  fetchSleeperNFLState,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  fetchSleeperMatchups,
  fetchSleeperPlayers,
  findUserRoster,
  findOpponentRoster
} from '@/lib/api'
import { ESPNGame, UserLeague, PlayerLineup, SleeperRoster, SleeperUser, SleeperMatchup } from '@/types'
import { storage, GameConfig } from '@/lib/storage'
import GameConfigModal from './GameConfigModal'

interface RedZoneViewProps {
  user: User
  onBackToDashboard: () => void
}

export default function RedZoneView({ user, onBackToDashboard }: RedZoneViewProps) {
  const [games, setGames] = useState<ESPNGame[]>([])
  const [selectedGameIndex, setSelectedGameIndex] = useState<number | null>(null)
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([])
  const [playerLineups, setPlayerLineups] = useState<PlayerLineup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const [sleeperPlayers, setSleeperPlayers] = useState<Record<string, any>>({})
  const [gameConfig, setGameConfig] = useState<GameConfig[]>([])
  const [filteredGames, setFilteredGames] = useState<ESPNGame[]>([])
  const [showGameConfig, setShowGameConfig] = useState(false)
  const [message, setMessage] = useState('')
  const [hiddenLeagues, setHiddenLeagues] = useState<Set<string>>(new Set())
  const [showLeagueFilter, setShowLeagueFilter] = useState(false)
  const [showAllLeagues, setShowAllLeagues] = useState(false)
  const [allLeaguesData, setAllLeaguesData] = useState<Array<{
    leagueId: string
    leagueName: string
    userRoster: { rosterId: number, points: number, projectedPoints: number, owner: string }
    opponentRoster: { rosterId: number, points: number, projectedPoints: number, owner: string }
    matchupId: number
  }>>([])
  const [allLeaguesLoading, setAllLeaguesLoading] = useState(false)
  

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

  const fetchAllLineups = useCallback(async (week: number, players: Record<string, any>) => {
    const allLineups: PlayerLineup[] = []

    try {
      for (const league of userLeagues) {
        const leagueId = league.sleeper_league_id

        // Fetch league data in parallel
        const [rosters, users, matchups] = await Promise.all([
          fetchSleeperLeagueRosters(leagueId),
          fetchSleeperLeagueUsers(leagueId),
          fetchSleeperMatchups(leagueId, week)
        ])

        // Find user's roster using stored Sleeper user ID
        const sleeperUserId = league.sleeper_user_id
        if (!sleeperUserId) {
          console.warn(`No Sleeper user ID stored for league ${leagueId}. Please re-add this league with user selection.`)
          continue
        }

        const userRoster = findUserRoster(rosters, sleeperUserId)
        if (!userRoster) {
          console.warn(`User roster not found in league ${leagueId} for Sleeper user ${sleeperUserId}`)
          continue
        }

        // Find opponent's roster
        const opponentRoster = findOpponentRoster(rosters, matchups, userRoster.roster_id)

        // Add user's starters to lineup
        if (userRoster.starters) {
          for (const playerId of userRoster.starters) {
            if (playerId && players[playerId]) {
              const player = players[playerId]
              const playerData = {
                playerId,
                name: `${player.first_name} ${player.last_name}`,
                position: player.position || 'N/A',
                team: player.team || 'FA',
                jerseyNumber: player.number?.toString() || '',
                leagueId: league.sleeper_league_id,
                leagueName: league.custom_nickname || league.league_name || 'League',
                isOpponent: false
              }

              // Check if player already exists in lineup
              const existingPlayerIndex = allLineups.findIndex(p => 
                p.playerId === playerId && p.isOpponent === false && p.team === playerData.team
              )

              if (existingPlayerIndex >= 0) {
                // Add league to existing player
                allLineups[existingPlayerIndex].leagueIds.push(playerData.leagueId)
                allLineups[existingPlayerIndex].leagueNames.push(playerData.leagueName)
              } else {
                // Add new player
                allLineups.push({
                  ...playerData,
                  leagueIds: [playerData.leagueId],
                  leagueNames: [playerData.leagueName]
                })
              }
            }
          }
        }

        // Add opponent's starters to lineup
        if (opponentRoster && opponentRoster.starters) {
          for (const playerId of opponentRoster.starters) {
            if (playerId && players[playerId]) {
              const player = players[playerId]
              const playerData = {
                playerId,
                name: `${player.first_name} ${player.last_name}`,
                position: player.position || 'N/A',
                team: player.team || 'FA',
                jerseyNumber: player.number?.toString() || '',
                leagueId: league.sleeper_league_id,
                leagueName: league.custom_nickname || league.league_name || 'League',
                isOpponent: true
              }

              // Check if player already exists in lineup
              const existingPlayerIndex = allLineups.findIndex(p => 
                p.playerId === playerId && p.isOpponent === true && p.team === playerData.team
              )

              if (existingPlayerIndex >= 0) {
                // Add league to existing player
                allLineups[existingPlayerIndex].leagueIds.push(playerData.leagueId)
                allLineups[existingPlayerIndex].leagueNames.push(playerData.leagueName)
              } else {
                // Add new player
                allLineups.push({
                  ...playerData,
                  leagueIds: [playerData.leagueId],
                  leagueNames: [playerData.leagueName]
                })
              }
            }
          }
        }
      }

      setPlayerLineups(allLineups)
      
      // Cache the lineups
      storage.setPlayerLineups(allLineups)
      
      // Create compact player cache with only needed players
      const allPlayerIds = Array.from(new Set(allLineups.map(p => p.playerId)))
      storage.setCompactSleeperPlayers(players, allPlayerIds)
    } catch (error: any) {
      setError('Error fetching lineups: ' + error.message)
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
      // Fetch filtered current week games and players data in parallel
      const [filteredGamesData, playersData] = await Promise.all([
        fetchFilteredCurrentWeekGames(),
        fetchSleeperPlayers()
      ])

      setGames(filteredGamesData.events)
      setCurrentWeek(filteredGamesData.week.number)
      setSleeperPlayers(playersData)

      // Cache the data
      storage.setGames(filteredGamesData.events)
      storage.setCurrentWeek(filteredGamesData.week.number)
      // Note: Sleeper players will be cached as compact data in fetchAllLineups

      // Fetch lineups for all user leagues
      await fetchAllLineups(filteredGamesData.week.number, playersData)

    } catch (error: any) {
      setError('Error fetching data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [userLeagues.length, fetchAllLineups])

  // Load cached data and user leagues on mount
  useEffect(() => {
    fetchUserLeagues()
    loadCachedData()
  }, [])

  // Removed redundant useEffect - now handled by memoized filteredGamesMemo

  // Keyboard navigation for game selection only
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key

      // Game selection (1-9, A-Z)
      if (key >= '1' && key <= '9') {
        const gameIndex = parseInt(key) - 1
        if (gameIndex < filteredGames.length) {
          setSelectedGameIndex(gameIndex)
          storage.setSelectedGame(gameIndex)
        }
      } else if (key.toLowerCase() >= 'a' && key.toLowerCase() <= 'z') {
        const gameIndex = 9 + (key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0))
        if (gameIndex < filteredGames.length) {
          setSelectedGameIndex(gameIndex)
          storage.setSelectedGame(gameIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [filteredGames.length])

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

  const loadCachedData = () => {
    // Load cached data
    const cachedGames = storage.getGames()
    const cachedPlayers = storage.getSleeperPlayers()
    const cachedLineups = storage.getPlayerLineups()
    const cachedWeek = storage.getCurrentWeek()
    const cachedConfig = storage.getGameConfig()
    const cachedSelectedGame = storage.getSelectedGame()
    const cachedHiddenLeagues = storage.getHiddenLeagues()

    if (cachedGames) {
      setGames(cachedGames)
    }
    if (cachedPlayers) {
      setSleeperPlayers(cachedPlayers)
    }
    if (cachedLineups) {
      setPlayerLineups(cachedLineups)
    }
    if (cachedWeek) {
      setCurrentWeek(cachedWeek)
    }
    if (cachedConfig) {
      setGameConfig(cachedConfig)
    }
    if (cachedSelectedGame !== null) {
      setSelectedGameIndex(cachedSelectedGame)
    }
    if (cachedHiddenLeagues) {
      setHiddenLeagues(new Set(cachedHiddenLeagues))
    }

    // Clear expired cache
    storage.clearExpired()
  }

  // Memoized game filtering to avoid recalculation on every render
  const filteredGamesMemo = useMemo(() => {
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

  // Update filteredGames state when memoized value changes
  useEffect(() => {
    setFilteredGames(filteredGamesMemo)
  }, [filteredGamesMemo])

  const handleGameConfigSave = useCallback((newConfig: GameConfig[]) => {
    setGameConfig(newConfig)
    storage.setGameConfig(newConfig)
  }, [])

  const handleGameClick = useCallback((index: number) => {
    setSelectedGameIndex(index)
    storage.setSelectedGame(index)
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

  const fetchAllLeaguesMatchups = useCallback(async (week: number) => {
    if (userLeagues.length === 0) return

    setAllLeaguesLoading(true)
    const allLeaguesMatchups = []

    try {
      for (const league of userLeagues) {
        const leagueId = league.sleeper_league_id
        const sleeperUserId = league.sleeper_user_id

        if (!sleeperUserId) continue

        // Fetch league data
        const [rosters, users, matchups] = await Promise.all([
          fetchSleeperLeagueRosters(leagueId),
          fetchSleeperLeagueUsers(leagueId),
          fetchSleeperMatchups(leagueId, week)
        ])

        // Find user's roster
        const userRoster = findUserRoster(rosters, sleeperUserId)
        if (!userRoster) continue

        // Find user's matchup
        const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id)
        if (!userMatchup) continue

        // Find opponent's matchup and roster
        const opponentMatchup = matchups.find(m =>
          m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
        )
        const opponentRoster = opponentMatchup ? rosters.find(r => r.roster_id === opponentMatchup.roster_id) : null

        // Find user names
        const userOwner = users.find(u => u.user_id === userRoster.owner_id)?.display_name || 'You'
        const opponentOwner = opponentRoster ?
          users.find(u => u.user_id === opponentRoster.owner_id)?.display_name || 'Opponent' : 'Bye Week'

        // Calculate projected points (simple estimation based on current scoring rate)
        const userProjectedPoints = userMatchup.points || 0
        const opponentProjectedPoints = opponentMatchup?.points || 0

        allLeaguesMatchups.push({
          leagueId: league.sleeper_league_id,
          leagueName: league.custom_nickname || league.league_name || 'League',
          userRoster: {
            rosterId: userRoster.roster_id,
            points: userMatchup.points || 0,
            projectedPoints: userProjectedPoints,
            owner: userOwner
          },
          opponentRoster: {
            rosterId: opponentRoster?.roster_id || 0,
            points: opponentMatchup?.points || 0,
            projectedPoints: opponentProjectedPoints,
            owner: opponentOwner
          },
          matchupId: userMatchup.matchup_id
        })
      }

      setAllLeaguesData(allLeaguesMatchups)
      // Cache the data
      storage.set('redzone_all_leagues_matchups', allLeaguesMatchups)

    } catch (error: any) {
      setError('Error fetching all leagues data: ' + error.message)
    } finally {
      setAllLeaguesLoading(false)
    }
  }, [userLeagues])

  // Memoized function to get players for a specific game - optimized for performance
  const getPlayersForGame = useMemo(() => {
    // Create a map of team abbreviations to players for faster lookup
    const teamPlayerMap = new Map<string, { myPlayers: PlayerLineup[], opponents: PlayerLineup[] }>()

    // Pre-filter visible players once instead of per game
    const visiblePlayers = playerLineups.filter(player =>
      player.leagueIds.some(leagueId => !hiddenLeagues.has(leagueId))
    )

    // Process each visible player once and group by team
    for (const player of visiblePlayers) {
      // Filter out hidden leagues from the player's data
      const visibleLeagueIndices = player.leagueIds
        .map((leagueId, index) => ({ leagueId, index }))
        .filter(({ leagueId }) => !hiddenLeagues.has(leagueId))

      const filteredPlayer = {
        ...player,
        leagueIds: visibleLeagueIndices.map(({ leagueId }) => leagueId),
        leagueNames: visibleLeagueIndices.map(({ index }) => player.leagueNames[index])
      }

      if (!teamPlayerMap.has(player.team)) {
        teamPlayerMap.set(player.team, { myPlayers: [], opponents: [] })
      }

      const teamData = teamPlayerMap.get(player.team)!
      if (player.isOpponent) {
        teamData.opponents.push(filteredPlayer)
      } else {
        teamData.myPlayers.push(filteredPlayer)
      }
    }

    // Return optimized lookup function
    return (game: ESPNGame) => {
      if (!game.competitions[0]) return { homeTeam: { myPlayers: [], opponents: [] }, awayTeam: { myPlayers: [], opponents: [] } }

      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === 'home')
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === 'away')

      const homeTeamAbbr = homeTeam?.team.abbreviation || ''
      const awayTeamAbbr = awayTeam?.team.abbreviation || ''

      return {
        homeTeam: teamPlayerMap.get(homeTeamAbbr) || { myPlayers: [], opponents: [] },
        awayTeam: teamPlayerMap.get(awayTeamAbbr) || { myPlayers: [], opponents: [] }
      }
    }
  }, [playerLineups, hiddenLeagues])

  // Memoized selected game and players calculation to avoid unnecessary recalculations
  // IMPORTANT: Must be before any conditional returns to maintain hook order
  const selectedGame = useMemo(() =>
    selectedGameIndex !== null ? filteredGames[selectedGameIndex] : null,
    [selectedGameIndex, filteredGames]
  )

  const selectedGamePlayers = useMemo(() =>
    selectedGame ? getPlayersForGame(selectedGame) : null,
    [selectedGame, getPlayersForGame]
  )

  // Early return for empty state - after all hooks are called
  if (filteredGames.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="bg-slate-800 border-b border-slate-700 p-6">
          <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <button
                onClick={onBackToDashboard}
                className="btn btn-secondary"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-3xl font-bold">RedZone View</h1>
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

        <div className="container mx-auto px-6 py-20">
          <div className="text-center max-w-lg mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-6">Ready to Track Your Players</h2>
            <p className="text-slate-400 text-lg mb-8">Click "Refresh Data" to load current week games and your active lineups</p>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <p className="text-sm text-slate-500">Make sure you have leagues configured in your dashboard first</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="fixed bottom-6 left-6 right-6 max-w-lg mx-auto bg-red-900/90 backdrop-blur-sm border border-red-700 text-red-100 p-4 rounded-lg shadow-lg">
            <div className="flex items-start gap-3">
              <div className="text-red-400 flex-shrink-0 mt-0.5">⚠</div>
              <div>{error}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header with Controls */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="container mx-auto">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={onBackToDashboard}
              className="btn btn-secondary"
            >
              ← Back to Dashboard
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-bold">Week {currentWeek} Games</h1>
              <p className="text-sm text-slate-400 mt-1">
                Hotkeys: 1-9/A-Z = Select games
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={refreshData}
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowLeagueFilter(!showLeagueFilter)}
                  className="btn btn-secondary"
                >
                  Filter Leagues
                </button>
                {showLeagueFilter && (
                  <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[200px]">
                    <div className="p-3 border-b border-slate-700">
                      <h3 className="font-semibold text-white text-sm">League Visibility</h3>
                      <p className="text-xs text-slate-400 mt-1">Hide leagues to focus on active matchups</p>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {uniqueLeagues.map(league => (
                        <button
                          key={league.id}
                          onClick={() => toggleLeagueVisibility(league.id)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors flex items-center justify-between group"
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
              const isSelected = selectedGameIndex === index
              
              return (
                <button
                  key={game.id}
                  onClick={() => setSelectedGameIndex(index)}
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
              <div className="flex items-center justify-between mb-3 max-w-4xl mx-auto">
                {(() => {
                  const awayTeamData = selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'away')
                  const homeTeamData = selectedGame.competitions[0]?.competitors.find(c => c.homeAway === 'home')
                  const awayRecord = awayTeamData?.records?.find(r => r.type === 'total')?.summary
                  const homeRecord = homeTeamData?.records?.find(r => r.type === 'total')?.summary
                  const venue = selectedGame.competitions[0]?.venue?.fullName
                  const weather = selectedGame.weather
                  return (
                    <>
                      <div className="flex items-start gap-3 flex-1 justify-end">
                        {awayTeamData?.team?.logo && (
                          <img src={awayTeamData.team.logo} alt={awayTeamData.team.displayName} className="w-10 h-10" style={{marginTop: '-5px'}} />
                        )}
                        <div className="text-right">
                          <h2 className="text-2xl font-bold text-white">{awayTeamData?.team.displayName}</h2>
                          {awayRecord && <div className="text-xs text-slate-400">({awayRecord})</div>}
                        </div>
                      </div>
                      <div className="flex flex-col items-center px-6 min-w-[160px]">
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
                      <div className="flex items-start gap-3 flex-1">
                        <div className="text-left">
                          <h2 className="text-2xl font-bold text-white">{homeTeamData?.team.displayName}</h2>
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

      {(error || message) && (
        <div className={`fixed bottom-6 left-6 right-6 max-w-lg mx-auto backdrop-blur-sm p-4 rounded-lg shadow-lg ${
          error 
            ? 'bg-red-900/90 border border-red-700 text-red-100' 
            : 'bg-green-900/90 border border-green-700 text-green-100'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 mt-0.5 ${error ? 'text-red-400' : 'text-green-400'}`}>
              {error ? '⚠' : '✓'}
            </div>
            <div>{error || message}</div>
            <button
              onClick={() => {
                setError('')
                setMessage('')
              }}
              className="ml-auto text-xs opacity-75 hover:opacity-100"
            >
              ✕
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