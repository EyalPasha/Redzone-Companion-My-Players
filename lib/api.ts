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