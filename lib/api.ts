import { ESPNScoreboard, SleeperLeague, SleeperMatchup, SleeperPlayers, SleeperRoster, SleeperUser } from '@/types'
import { isAbortError } from '@/lib/errors'

const SLEEPER_LEAGUE_ID_PATTERN = /^\d+$/

interface SleeperNFLState {
  week?: number
  season?: string
  season_type?: string
}

const fetchJson = async <T>(url: string, errorLabel: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const isSleeperLeagueId = (leagueId: string): boolean => {
  return SLEEPER_LEAGUE_ID_PATTERN.test(leagueId.trim())
}

const normalizeSleeperLeagueId = (leagueId: string): string => {
  const trimmedLeagueId = leagueId.trim()

  if (!isSleeperLeagueId(trimmedLeagueId)) {
    throw new Error('Sleeper league ID must contain only numbers.')
  }

  return encodeURIComponent(trimmedLeagueId)
}

const normalizeWeek = (week: number): number => {
  if (!Number.isInteger(week) || week < 1 || week > 30) {
    throw new Error('NFL week must be a number between 1 and 30.')
  }

  return week
}

// ESPN API Functions
export const fetchCurrentWeekGames = async (signal?: AbortSignal): Promise<ESPNScoreboard> => {
  return fetchJson<ESPNScoreboard>(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    'ESPN API error',
    signal
  )
}

// Cache for week calculation to avoid repeated expensive operations
let weekCalculationCache: { timestamp: number, week: number } | null = null
const WEEK_CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

// Calculate the effective current week with 6-hour delay after last game
export const getEffectiveCurrentWeek = async (signal?: AbortSignal) => {
  try {
    // Check cache first
    const now = Date.now()
    if (weekCalculationCache && (now - weekCalculationCache.timestamp) < WEEK_CACHE_DURATION) {
      return weekCalculationCache.week
    }

    // Get both sources of truth
    const [nflState, scoreboard] = await Promise.all([
      fetchSleeperNFLState(signal),
      fetchCurrentWeekGames(signal)
    ])

    const sleeperWeek = nflState.week || 1
    const espnWeek = scoreboard.week?.number

    // Check what weeks are actually available in the games data
    const gameWeeks = [...new Set(scoreboard.events.map(game => game.week?.number).filter(Boolean))]
    let effectiveWeek = sleeperWeek

    // If Sleeper week doesn't match available games, use ESPN week
    if (!gameWeeks.includes(sleeperWeek) && espnWeek && gameWeeks.includes(espnWeek)) {
      effectiveWeek = espnWeek
    }

    // Apply 6-hour delay logic for week transition
    const previousWeekGames = scoreboard.events.filter(game => game.week?.number === (sleeperWeek - 1))

    if (previousWeekGames.length > 0) {
      const latestPreviousGame = previousWeekGames.reduce((latest, game) => {
        const gameTime = new Date(game.date)
        const latestTime = new Date(latest.date)
        return gameTime > latestTime ? game : latest
      })

      const gameEndTime = new Date(latestPreviousGame.date)
      gameEndTime.setHours(gameEndTime.getHours() + 3.5) // Game duration
      const sixHoursAfterGame = new Date(gameEndTime.getTime() + (6 * 60 * 60 * 1000))

      if (now < sixHoursAfterGame.getTime()) {
        effectiveWeek = sleeperWeek - 1
      }
    }

    // Cache the result
    weekCalculationCache = { timestamp: now, week: effectiveWeek }
    return effectiveWeek

  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    console.error('Error calculating effective current week:', error)
    // Fallback to Sleeper's current week
    const nflState = await fetchSleeperNFLState(signal)
    const fallbackWeek = nflState.week || 1
    weekCalculationCache = { timestamp: Date.now(), week: fallbackWeek }
    return fallbackWeek
  }
}

// Optimized function that calculates week and filters games in one go
export const fetchFilteredCurrentWeekGames = async (signal?: AbortSignal) => {
  try {
    // Check cache first
    const now = Date.now()
    if (weekCalculationCache && (now - weekCalculationCache.timestamp) < WEEK_CACHE_DURATION) {
      const scoreboard = await fetchCurrentWeekGames(signal)
      const effectiveWeek = weekCalculationCache.week
      const filteredEvents = scoreboard.events.filter(game => game.week?.number === effectiveWeek)

      return {
        ...scoreboard,
        week: { number: effectiveWeek },
        events: filteredEvents.length > 0 ? filteredEvents : scoreboard.events
      }
    }

    // Get both sources of truth in parallel
    const [nflState, scoreboard] = await Promise.all([
      fetchSleeperNFLState(signal),
      fetchCurrentWeekGames(signal)
    ])

    const sleeperWeek = nflState.week || 1
    const gameWeeks = [...new Set(scoreboard.events.map(game => game.week?.number).filter(Boolean))]
    let effectiveWeek = sleeperWeek

    // Use ESPN week if Sleeper week not available in games
    if (!gameWeeks.includes(sleeperWeek) && scoreboard.week?.number && gameWeeks.includes(scoreboard.week.number)) {
      effectiveWeek = scoreboard.week.number
    }

    // Apply 6-hour delay logic for week transition
    const previousWeekGames = scoreboard.events.filter(game => game.week?.number === (sleeperWeek - 1))

    if (previousWeekGames.length > 0) {
      const latestPreviousGame = previousWeekGames.reduce((latest, game) =>
        new Date(game.date) > new Date(latest.date) ? game : latest
      )

      const gameEndTime = new Date(latestPreviousGame.date)
      gameEndTime.setHours(gameEndTime.getHours() + 9.5) // Game start + 3.5 duration + 6 hour delay

      if (now < gameEndTime.getTime()) {
        effectiveWeek = sleeperWeek - 1
      }
    }

    // Cache the calculated week
    weekCalculationCache = { timestamp: now, week: effectiveWeek }

    // Filter games by effective week
    const filteredEvents = scoreboard.events.filter(game => game.week?.number === effectiveWeek)

    return {
      ...scoreboard,
      week: { number: effectiveWeek },
      events: filteredEvents.length > 0 ? filteredEvents : scoreboard.events
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    console.error('Error fetching filtered current week games:', error)
    throw error
  }
}

// Sleeper API Functions
export const fetchSleeperNFLState = async (signal?: AbortSignal): Promise<SleeperNFLState> => {
  return fetchJson<SleeperNFLState>(
    'https://api.sleeper.app/v1/state/nfl',
    'Sleeper state API error',
    signal
  )
}

export const fetchSleeperLeagueUsers = async (leagueId: string, signal?: AbortSignal): Promise<SleeperUser[]> => {
  const normalizedLeagueId = normalizeSleeperLeagueId(leagueId)
  return fetchJson<SleeperUser[]>(
    `https://api.sleeper.app/v1/league/${normalizedLeagueId}/users`,
    'Sleeper users API error',
    signal
  )
}

export const fetchSleeperLeagueRosters = async (leagueId: string, signal?: AbortSignal): Promise<SleeperRoster[]> => {
  const normalizedLeagueId = normalizeSleeperLeagueId(leagueId)
  return fetchJson<SleeperRoster[]>(
    `https://api.sleeper.app/v1/league/${normalizedLeagueId}/rosters`,
    'Sleeper rosters API error',
    signal
  )
}

export const fetchSleeperMatchups = async (leagueId: string, week: number, signal?: AbortSignal): Promise<SleeperMatchup[]> => {
  const normalizedLeagueId = normalizeSleeperLeagueId(leagueId)
  const normalizedWeek = normalizeWeek(week)
  return fetchJson<SleeperMatchup[]>(
    `https://api.sleeper.app/v1/league/${normalizedLeagueId}/matchups/${normalizedWeek}`,
    'Sleeper matchups API error',
    signal
  )
}

export const fetchSleeperPlayers = async (signal?: AbortSignal): Promise<SleeperPlayers> => {
  return fetchJson<SleeperPlayers>(
    'https://api.sleeper.app/v1/players/nfl',
    'Sleeper players API error',
    signal
  )
}

export const fetchSleeperLeague = async (leagueId: string, signal?: AbortSignal): Promise<SleeperLeague> => {
  const normalizedLeagueId = normalizeSleeperLeagueId(leagueId)
  return fetchJson<SleeperLeague>(
    `https://api.sleeper.app/v1/league/${normalizedLeagueId}`,
    'Sleeper league API error',
    signal
  )
}

// Helper function to find user's roster in a league by Sleeper user ID
export const findUserRoster = (rosters: SleeperRoster[], sleeperUserId: string): SleeperRoster | null => {
  return rosters.find(roster => roster.owner_id === sleeperUserId) || null
}

// Helper function to find user by email in Sleeper users list
export const findSleeperUserByEmail = (users: SleeperUser[], email: string): SleeperUser | null => {
  // Try to match by email if available in metadata
  return users.find(user => 
    user.user_id && (
      // Some users might have email in metadata (not always available)
      user.email === email ||
      // Or try display_name matching email
      user.display_name?.toLowerCase() === email.toLowerCase()
    )
  ) || null
}

// Helper function to get opponent's roster for a given matchup
export const findOpponentRoster = (
  rosters: SleeperRoster[], 
  matchups: SleeperMatchup[], 
  userRosterId: number
): SleeperRoster | null => {
  // Find user's matchup
  const userMatchup = matchups.find(matchup => matchup.roster_id === userRosterId)
  if (!userMatchup) return null

  // Find opponent in same matchup
  const opponentMatchup = matchups.find(matchup => 
    matchup.matchup_id === userMatchup.matchup_id && matchup.roster_id !== userRosterId
  )
  if (!opponentMatchup) return null

  // Find opponent's roster
  return rosters.find(roster => roster.roster_id === opponentMatchup.roster_id) || null
}
