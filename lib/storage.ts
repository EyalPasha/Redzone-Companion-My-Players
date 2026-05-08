import { ESPNGame, PlayerLineup, SleeperPlayers, UserLeague } from '@/types'

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
  HIDDEN_LEAGUES: 'redzone_hidden_leagues',
  ACTIVE_USER_ID: 'redzone_active_user_id'
} as const

export interface GameConfig {
  gameId: string
  isVisible: boolean
  customOrder: number
  customLabel?: string
}

export interface CachedData<T = unknown> {
  timestamp: number
  data: T
}

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000

// Storage quota management
const MAX_STORAGE_SIZE = 4 * 1024 * 1024 // 4MB limit to be safe

// Debounced storage writes to reduce frequent localStorage operations
const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_DELAY = 500 // 500ms debounce

const hasLocalStorage = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

const isQuotaExceededError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}

const writeCacheItem = (key: string, dataString: string) => {
  if (!hasLocalStorage()) return

  if (dataString.length > MAX_STORAGE_SIZE && key === STORAGE_KEYS.SLEEPER_PLAYERS) {
    console.warn('Skipping Sleeper players cache due to size - will fetch fresh each time')
    return
  }

  try {
    localStorage.setItem(key, dataString)
  } catch (error: unknown) {
    if (!isQuotaExceededError(error)) {
      throw error
    }

    console.warn(`Storage quota exceeded for key: ${key}. Clearing expired cache and retrying...`)
    storage.clearExpired()

    try {
      localStorage.setItem(key, dataString)
    } catch (retryError: unknown) {
      if (!isQuotaExceededError(retryError)) {
        throw retryError
      }

      console.warn(`Still quota exceeded for key: ${key}. Skipping cache for this item.`)
    }
  }
}

const clearPendingWrite = (key: string) => {
  const pendingWrite = debounceMap.get(key)
  if (!pendingWrite) return

  clearTimeout(pendingWrite)
  debounceMap.delete(key)
}

const clearPendingWrites = () => {
  debounceMap.forEach(timeoutId => clearTimeout(timeoutId))
  debounceMap.clear()
}

export const storage = {
  // Generic cache methods with debouncing for frequent updates
  set: <T>(key: string, data: T) => {
    const cachedData: CachedData<T> = {
      timestamp: Date.now(),
      data
    }
    const dataString = JSON.stringify(cachedData)

    // Clear existing debounce timeout for this key
    clearPendingWrite(key)

    // Set debounced write operation
    const timeoutId = setTimeout(() => {
      writeCacheItem(key, dataString)
      debounceMap.delete(key)
    }, DEBOUNCE_DELAY)

    debounceMap.set(key, timeoutId)
  },

  // Immediate set for critical data (no debouncing)
  setImmediate: <T>(key: string, data: T) => {
    clearPendingWrite(key)

    const cachedData: CachedData<T> = {
      timestamp: Date.now(),
      data
    }
    const dataString = JSON.stringify(cachedData)

    writeCacheItem(key, dataString)
  },

  get: <T>(key: string): T | null => {
    try {
      if (!hasLocalStorage()) return null

      const item = localStorage.getItem(key)
      if (!item) return null

      const cached = JSON.parse(item) as CachedData<T>
      if (typeof cached.timestamp !== 'number' || !('data' in cached)) {
        localStorage.removeItem(key)
        return null
      }
      
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
    return storage.get<GameConfig[]>(STORAGE_KEYS.GAME_CONFIG) || []
  },

  setGameConfig: (config: GameConfig[]) => {
    storage.set(STORAGE_KEYS.GAME_CONFIG, config)
  },

  // Games data
  getGames: (): ESPNGame[] | null => {
    return storage.get<ESPNGame[]>(STORAGE_KEYS.GAMES)
  },

  setGames: (games: ESPNGame[]) => {
    storage.set(STORAGE_KEYS.GAMES, games)
  },

  // Player lineups
  getPlayerLineups: (): PlayerLineup[] | null => {
    return storage.get<PlayerLineup[]>(STORAGE_KEYS.PLAYER_LINEUPS)
  },

  setPlayerLineups: (lineups: PlayerLineup[]) => {
    storage.set(STORAGE_KEYS.PLAYER_LINEUPS, lineups)
  },

  // Sleeper players data
  getSleeperPlayers: (): SleeperPlayers | null => {
    return storage.get<SleeperPlayers>(STORAGE_KEYS.SLEEPER_PLAYERS)
  },

  setSleeperPlayers: (players: SleeperPlayers) => {
    // Try to cache full dataset, but gracefully handle quota exceeded
    storage.set(STORAGE_KEYS.SLEEPER_PLAYERS, players)
  },

  // Store only the players we need (from lineups) to save space
  setCompactSleeperPlayers: (allPlayers: SleeperPlayers, playerIds: string[]) => {
    const compactPlayers: SleeperPlayers = {}
    
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
    return storage.get<number>(STORAGE_KEYS.SELECTED_GAME)
  },

  setSelectedGame: (index: number | null) => {
    if (index !== null) {
      storage.setImmediate(STORAGE_KEYS.SELECTED_GAME, index)
    } else if (hasLocalStorage()) {
      clearPendingWrite(STORAGE_KEYS.SELECTED_GAME)
      localStorage.removeItem(STORAGE_KEYS.SELECTED_GAME)
    }
  },

  getCurrentWeek: (): number | null => {
    return storage.get<number>(STORAGE_KEYS.CURRENT_WEEK)
  },

  setCurrentWeek: (week: number) => {
    storage.setImmediate(STORAGE_KEYS.CURRENT_WEEK, week)
  },

  getCurrentView: (): 'dashboard' | 'redzone' | 'allleagues' | null => {
    return storage.get<'dashboard' | 'redzone' | 'allleagues'>(STORAGE_KEYS.CURRENT_VIEW)
  },

  setCurrentView: (view: 'dashboard' | 'redzone' | 'allleagues') => {
    storage.setImmediate(STORAGE_KEYS.CURRENT_VIEW, view)
  },

  getActiveUserId: (): string | null => {
    return storage.get<string>(STORAGE_KEYS.ACTIVE_USER_ID)
  },

  setActiveUserId: (userId: string) => {
    storage.setImmediate(STORAGE_KEYS.ACTIVE_USER_ID, userId)
  },

  // User leagues
  getUserLeagues: (): UserLeague[] | null => {
    return storage.get<UserLeague[]>(STORAGE_KEYS.USER_LEAGUES)
  },

  setUserLeagues: (leagues: UserLeague[]) => {
    storage.set(STORAGE_KEYS.USER_LEAGUES, leagues)
  },

  // Hidden leagues
  getHiddenLeagues: (): string[] => {
    return storage.get<string[]>(STORAGE_KEYS.HIDDEN_LEAGUES) || []
  },

  setHiddenLeagues: (leagueIds: string[]) => {
    storage.set(STORAGE_KEYS.HIDDEN_LEAGUES, leagueIds)
  },

  // Clear all cache
  clearCache: () => {
    clearPendingWrites()

    if (!hasLocalStorage()) return

    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  },

  // Clear expired cache
  clearExpired: () => {
    if (!hasLocalStorage()) return

    Object.values(STORAGE_KEYS).forEach(key => {
      const item = localStorage.getItem(key)
      if (item) {
        try {
          const cached = JSON.parse(item) as CachedData
          if (typeof cached.timestamp !== 'number') {
            localStorage.removeItem(key)
            return
          }
          if (Date.now() - cached.timestamp > CACHE_DURATION) {
            localStorage.removeItem(key)
          }
        } catch {
          localStorage.removeItem(key)
        }
      }
    })
  }
}
