// Local storage utilities for caching data
export const STORAGE_KEYS = {
  GAMES: 'redzone_games',
  PLAYER_LINEUPS: 'redzone_player_lineups',
  GAME_CONFIG: 'redzone_game_config',
  SLEEPER_PLAYERS: 'redzone_sleeper_players',
  SELECTED_GAME: 'redzone_selected_game',
  CURRENT_WEEK: 'redzone_current_week',
  CURRENT_VIEW: 'redzone_current_view',
  USER_LEAGUES: 'redzone_user_leagues',
  HIDDEN_LEAGUES: 'redzone_hidden_leagues'
} as const

export interface GameConfig {
  gameId: string
  isVisible: boolean
  customOrder: number
  customLabel?: string
}

export interface CachedData {
  timestamp: number
  data: any
}

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000

// Storage quota management
const MAX_STORAGE_SIZE = 4 * 1024 * 1024 // 4MB limit to be safe

// Debounced storage writes to reduce frequent localStorage operations
const debounceMap = new Map<string, NodeJS.Timeout>()
const DEBOUNCE_DELAY = 500 // 500ms debounce

export const storage = {
  // Generic cache methods with debouncing for frequent updates
  set: (key: string, data: any) => {
    const cachedData: CachedData = {
      timestamp: Date.now(),
      data
    }
    const dataString = JSON.stringify(cachedData)

    // Clear existing debounce timeout for this key
    if (debounceMap.has(key)) {
      clearTimeout(debounceMap.get(key)!)
    }

    // Set debounced write operation
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(key, dataString)
      } catch (error: any) {
        if (error.name === 'QuotaExceededError') {
          console.warn(`Storage quota exceeded for key: ${key}. Clearing cache and retrying...`)

          // Clear expired cache first
          storage.clearExpired()

          try {
            localStorage.setItem(key, dataString)
          } catch (retryError: any) {
            if (retryError.name === 'QuotaExceededError') {
              console.warn(`Still quota exceeded for key: ${key}. Skipping cache for this item.`)
              // For Sleeper players specifically, don't cache the full dataset
              if (key === STORAGE_KEYS.SLEEPER_PLAYERS) {
                console.log('Skipping Sleeper players cache due to size - will fetch fresh each time')
                return
              }
            } else {
              throw retryError
            }
          }
        } else {
          throw error
        }
      } finally {
        debounceMap.delete(key)
      }
    }, DEBOUNCE_DELAY)

    debounceMap.set(key, timeoutId)
  },

  // Immediate set for critical data (no debouncing)
  setImmediate: (key: string, data: any) => {
    const cachedData: CachedData = {
      timestamp: Date.now(),
      data
    }
    const dataString = JSON.stringify(cachedData)

    try {
      localStorage.setItem(key, dataString)
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        console.warn(`Storage quota exceeded for key: ${key}. Clearing cache and retrying...`)
        storage.clearExpired()

        try {
          localStorage.setItem(key, dataString)
        } catch (retryError: any) {
          if (retryError.name === 'QuotaExceededError') {
            console.warn(`Still quota exceeded for key: ${key}. Skipping cache for this item.`)
            if (key === STORAGE_KEYS.SLEEPER_PLAYERS) {
              console.log('Skipping Sleeper players cache due to size - will fetch fresh each time')
              return
            }
          } else {
            throw retryError
          }
        }
      } else {
        throw error
      }
    }
  },

  get: (key: string): any | null => {
    try {
      const item = localStorage.getItem(key)
      if (!item) return null

      const cached: CachedData = JSON.parse(item)
      
      // Check if cache is still valid
      if (Date.now() - cached.timestamp > CACHE_DURATION) {
        localStorage.removeItem(key)
        return null
      }

      return cached.data
    } catch (error) {
      console.error('Error reading from storage:', error)
      return null
    }
  },

  // Game configuration methods
  getGameConfig: (): GameConfig[] => {
    return storage.get(STORAGE_KEYS.GAME_CONFIG) || []
  },

  setGameConfig: (config: GameConfig[]) => {
    storage.set(STORAGE_KEYS.GAME_CONFIG, config)
  },

  // Games data
  getGames: () => {
    return storage.get(STORAGE_KEYS.GAMES)
  },

  setGames: (games: any[]) => {
    storage.set(STORAGE_KEYS.GAMES, games)
  },

  // Player lineups
  getPlayerLineups: () => {
    return storage.get(STORAGE_KEYS.PLAYER_LINEUPS)
  },

  setPlayerLineups: (lineups: any[]) => {
    storage.set(STORAGE_KEYS.PLAYER_LINEUPS, lineups)
  },

  // Sleeper players data
  getSleeperPlayers: () => {
    return storage.get(STORAGE_KEYS.SLEEPER_PLAYERS)
  },

  setSleeperPlayers: (players: any) => {
    // Try to cache full dataset, but gracefully handle quota exceeded
    storage.set(STORAGE_KEYS.SLEEPER_PLAYERS, players)
  },

  // Store only the players we need (from lineups) to save space
  setCompactSleeperPlayers: (allPlayers: any, playerIds: string[]) => {
    const compactPlayers: any = {}
    
    // Only store players that are actually in our lineups
    playerIds.forEach(playerId => {
      if (allPlayers[playerId]) {
        compactPlayers[playerId] = {
          first_name: allPlayers[playerId].first_name,
          last_name: allPlayers[playerId].last_name,
          position: allPlayers[playerId].position,
          team: allPlayers[playerId].team,
          number: allPlayers[playerId].number
        }
      }
    })
    
    storage.set(STORAGE_KEYS.SLEEPER_PLAYERS, compactPlayers)
  },

  // UI state
  getSelectedGame: (): number | null => {
    return storage.get(STORAGE_KEYS.SELECTED_GAME)
  },

  setSelectedGame: (index: number | null) => {
    if (index !== null) {
      storage.set(STORAGE_KEYS.SELECTED_GAME, index)
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_GAME)
    }
  },

  getCurrentWeek: (): number | null => {
    return storage.get(STORAGE_KEYS.CURRENT_WEEK)
  },

  setCurrentWeek: (week: number) => {
    storage.set(STORAGE_KEYS.CURRENT_WEEK, week)
  },

  getCurrentView: (): 'dashboard' | 'redzone' | 'allleagues' | null => {
    return storage.get(STORAGE_KEYS.CURRENT_VIEW)
  },

  setCurrentView: (view: 'dashboard' | 'redzone' | 'allleagues') => {
    storage.set(STORAGE_KEYS.CURRENT_VIEW, view)
  },

  // User leagues
  getUserLeagues: () => {
    return storage.get(STORAGE_KEYS.USER_LEAGUES)
  },

  setUserLeagues: (leagues: any[]) => {
    storage.set(STORAGE_KEYS.USER_LEAGUES, leagues)
  },

  // Hidden leagues
  getHiddenLeagues: (): string[] => {
    return storage.get(STORAGE_KEYS.HIDDEN_LEAGUES) || []
  },

  setHiddenLeagues: (leagueIds: string[]) => {
    storage.set(STORAGE_KEYS.HIDDEN_LEAGUES, leagueIds)
  },

  // Clear all cache
  clearCache: () => {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  },

  // Clear expired cache
  clearExpired: () => {
    Object.values(STORAGE_KEYS).forEach(key => {
      const item = localStorage.getItem(key)
      if (item) {
        try {
          const cached: CachedData = JSON.parse(item)
          if (Date.now() - cached.timestamp > CACHE_DURATION) {
            localStorage.removeItem(key)
          }
        } catch (error) {
          localStorage.removeItem(key)
        }
      }
    })
  }
}