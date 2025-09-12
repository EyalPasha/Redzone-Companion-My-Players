'use client'

import { useState, useEffect } from 'react'
import { ESPNGame } from '@/types'
import { GameConfig } from '@/lib/storage'

interface GameConfigModalProps {
  games: ESPNGame[]
  gameConfig: GameConfig[]
  onClose: () => void
  onSave: (config: GameConfig[]) => void
}

type WindowFilter = 'all' | 'early' | 'late' | 'early+late'

export default function GameConfigModal({ games, gameConfig, onClose, onSave }: GameConfigModalProps) {
  const [config, setConfig] = useState<GameConfig[]>([])
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all')

  useEffect(() => {
    // Initialize config with all games
    const initialConfig = games.map((game, index) => {
      const existingConfig = gameConfig.find(c => c.gameId === game.id)
      return {
        gameId: game.id,
        isVisible: existingConfig?.isVisible ?? true,
        customOrder: existingConfig?.customOrder ?? index,
        customLabel: existingConfig?.customLabel
      }
    })
    
    // Sort by custom order
    initialConfig.sort((a, b) => a.customOrder - b.customOrder)
    setConfig(initialConfig)
  }, [games, gameConfig])

  const getGameTime = (game: ESPNGame): Date => {
    return new Date(game.date)
  }

  const isEarlyWindow = (game: ESPNGame): boolean => {
    const gameTime = getGameTime(game)
    const hour = gameTime.getHours()
    const minute = gameTime.getMinutes()
    const dayOfWeek = gameTime.getDay() // 0 = Sunday, 1 = Monday, etc.
    return dayOfWeek === 0 && ((hour === 19 && minute === 0) || (hour === 20 && minute === 0)) // Sunday 7:00 PM or 8:00 PM sharp
  }

  const isLateWindow = (game: ESPNGame): boolean => {
    const gameTime = getGameTime(game)
    const hour = gameTime.getHours()
    const minute = gameTime.getMinutes()
    const dayOfWeek = gameTime.getDay() // 0 = Sunday, 1 = Monday, etc.
    return dayOfWeek === 0 && hour >= 22 && hour <= 23 && minute <= 50 // Sunday 10:00 PM to 11:50 PM (late games)
  }

  const toggleGameVisibility = (gameId: string) => {
    setConfig(prev => prev.map(c => 
      c.gameId === gameId ? { ...c, isVisible: !c.isVisible } : c
    ))
  }

  const applyWindowFilter = (filter: WindowFilter) => {
    setWindowFilter(filter)
    setConfig(prev => prev.map(c => {
      const game = games.find(g => g.id === c.gameId)
      if (!game) return c

      let shouldBeVisible = true
      
      if (filter === 'early') {
        shouldBeVisible = isEarlyWindow(game)
      } else if (filter === 'late') {
        shouldBeVisible = isLateWindow(game)
      } else if (filter === 'early+late') {
        shouldBeVisible = isEarlyWindow(game) || isLateWindow(game)
      } else {
        shouldBeVisible = true // 'all'
      }

      return { ...c, isVisible: shouldBeVisible }
    }))
  }

  const resetToDefault = () => {
    const defaultConfig = games.map((game, index) => ({
      gameId: game.id,
      isVisible: true,
      customOrder: index,
      customLabel: undefined
    }))
    setConfig(defaultConfig)
    setWindowFilter('all')
  }

  const handleSave = () => {
    // Update custom order based on current config array order
    const orderedConfig = config.map((c, index) => ({ ...c, customOrder: index }))
    onSave(orderedConfig)
    onClose()
  }

  const getGameInfo = (gameId: string) => {
    const game = games.find(g => g.id === gameId)
    if (!game) return { homeTeam: '', awayTeam: '', time: '' }
    
    const homeTeam = game.competitions[0]?.competitors.find(c => c.homeAway === 'home')
    const awayTeam = game.competitions[0]?.competitors.find(c => c.homeAway === 'away')
    const gameTime = getGameTime(game)
    
    return {
      homeTeam: homeTeam?.team.abbreviation || '',
      awayTeam: awayTeam?.team.abbreviation || '',
      time: gameTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit'
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="card max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Configure Games</h2>
          <div className="flex gap-3">
            <button onClick={resetToDefault} className="btn btn-secondary text-sm">
              Reset All
            </button>
            <button onClick={onClose} className="btn btn-secondary text-sm">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary text-sm">
              Save Configuration
            </button>
          </div>
        </div>

        {/* Window Filter Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => applyWindowFilter('all')}
            className={`btn text-sm px-4 py-2 ${
              windowFilter === 'all' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Show All
          </button>
          <button
            onClick={() => applyWindowFilter('early')}
            className={`btn text-sm px-4 py-2 ${
              windowFilter === 'early' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Early Window
          </button>
          <button
            onClick={() => applyWindowFilter('late')}
            className={`btn text-sm px-4 py-2 ${
              windowFilter === 'late' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Late Window
          </button>
          <button
            onClick={() => applyWindowFilter('early+late')}
            className={`btn text-sm px-4 py-2 ${
              windowFilter === 'early+late' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Both Windows
          </button>
        </div>

        {/* Compact Grid View */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {config.map((gameConfig, index) => {
            const { homeTeam, awayTeam, time } = getGameInfo(gameConfig.gameId)
            const game = games.find(g => g.id === gameConfig.gameId)
            const isEarly = game ? isEarlyWindow(game) : false
            const isLate = game ? isLateWindow(game) : false
            
            return (
              <button
                key={gameConfig.gameId}
                onClick={() => toggleGameVisibility(gameConfig.gameId)}
                className={`p-3 rounded-lg border-2 text-left transition-all h-[110px] flex flex-col ${
                  gameConfig.isVisible
                    ? 'bg-slate-700/50 border-green-500/50 shadow-lg'
                    : 'bg-slate-800/50 border-slate-600/50 opacity-40'
                }`}
              >
                {/* Header with order number and time */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-mono text-slate-400">
                    #{gameConfig.isVisible ? config.filter(c => c.isVisible).findIndex(c => c.gameId === gameConfig.gameId) + 1 : '—'}
                  </div>
                  <div className="text-xs text-slate-500">{time}</div>
                </div>
                
                {/* Teams section - fixed height */}
                <div className="flex-1 flex items-center justify-center mb-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <div className="flex items-center gap-1">
                      {(() => {
                        const awayTeamData = games.find(g => g.id === gameConfig.gameId)?.competitions[0]?.competitors.find(c => c.homeAway === 'away')
                        return awayTeamData?.team?.logo ? (
                          <img src={awayTeamData.team.logo} alt={awayTeam} className="w-4 h-4 flex-shrink-0" />
                        ) : null
                      })()}
                      <span className="text-xs font-medium truncate max-w-[3rem]">{awayTeam}</span>
                    </div>
                    <span className="text-slate-400 text-xs">@</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate max-w-[3rem]">{homeTeam}</span>
                      {(() => {
                        const homeTeamData = games.find(g => g.id === gameConfig.gameId)?.competitions[0]?.competitors.find(c => c.homeAway === 'home')
                        return homeTeamData?.team?.logo ? (
                          <img src={homeTeamData.team.logo} alt={homeTeam} className="w-4 h-4 flex-shrink-0" />
                        ) : null
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Bottom section with tags and status - fixed height */}
                <div className="flex items-end justify-between h-6">
                  <div className="flex gap-1">
                    {isEarly && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-600/30 leading-none">
                        Early
                      </span>
                    )}
                    {isLate && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-600/30 leading-none">
                        Late
                      </span>
                    )}
                  </div>
                  <div className={`text-xs font-medium leading-none ${
                    gameConfig.isVisible ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {gameConfig.isVisible ? '✓' : '✗'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

      </div>
    </div>
  )
}