import { ESPNScoreboard, SleeperMatchup, SleeperRoster, SleeperUser } from '@/types'

// ESPN API Functions
export const fetchCurrentWeekGames = async (): Promise<ESPNScoreboard> => {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching ESPN games:', error)
    throw error
  }
}

// Cache for week calculation to avoid repeated expensive operations
let weekCalculationCache: { timestamp: number, week: number } | null = null
const WEEK_CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

// Calculate the effective current week with 6-hour delay after last game
export const getEffectiveCurrentWeek = async () => {
  try {
    // Check cache first
    const now = Date.now()
    if (weekCalculationCache && (now - weekCalculationCache.timestamp) < WEEK_CACHE_DURATION) {
      return weekCalculationCache.week
    }

    // Get both sources of truth
    const [nflState, scoreboard] = await Promise.all([
      fetchSleeperNFLState(),
      fetchCurrentWeekGames()
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
    console.error('Error calculating effective current week:', error)
    // Fallback to Sleeper's current week
    const nflState = await fetchSleeperNFLState()
    const fallbackWeek = nflState.week || 1
    weekCalculationCache = { timestamp: Date.now(), week: fallbackWeek }
    return fallbackWeek
  }
}

// Optimized function that calculates week and filters games in one go
export const fetchFilteredCurrentWeekGames = async () => {
  try {
    // Check cache first
    const now = Date.now()
    if (weekCalculationCache && (now - weekCalculationCache.timestamp) < WEEK_CACHE_DURATION) {
      const scoreboard = await fetchCurrentWeekGames()
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
      fetchSleeperNFLState(),
      fetchCurrentWeekGames()
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
    console.error('Error fetching filtered current week games:', error)
    throw error
  }
}

// Sleeper API Functions
export const fetchSleeperNFLState = async () => {
  try {
    const response = await fetch('https://api.sleeper.app/v1/state/nfl')
    if (!response.ok) {
      throw new Error(`Sleeper state API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching Sleeper NFL state:', error)
    throw error
  }
}

export const fetchSleeperLeagueUsers = async (leagueId: string): Promise<SleeperUser[]> => {
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
    if (!response.ok) {
      throw new Error(`Sleeper users API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching Sleeper league users for ${leagueId}:`, error)
    throw error
  }
}

export const fetchSleeperLeagueRosters = async (leagueId: string): Promise<SleeperRoster[]> => {
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
    if (!response.ok) {
      throw new Error(`Sleeper rosters API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching Sleeper league rosters for ${leagueId}:`, error)
    throw error
  }
}

export const fetchSleeperMatchups = async (leagueId: string, week: number): Promise<SleeperMatchup[]> => {
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`)
    if (!response.ok) {
      throw new Error(`Sleeper matchups API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching Sleeper matchups for ${leagueId}, week ${week}:`, error)
    throw error
  }
}

export const fetchSleeperPlayers = async (): Promise<Record<string, any>> => {
  try {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl')
    if (!response.ok) {
      throw new Error(`Sleeper players API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching Sleeper players:', error)
    throw error
  }
}

export const fetchSleeperLeague = async (leagueId: string): Promise<any> => {
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`)
    if (!response.ok) {
      throw new Error(`Sleeper league API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching Sleeper league ${leagueId}:`, error)
    throw error
  }
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
      (user as any).email === email ||
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