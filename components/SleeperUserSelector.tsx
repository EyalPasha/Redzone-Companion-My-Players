'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchSleeperLeagueUsers } from '@/lib/api'
import { getErrorMessage, isAbortError } from '@/lib/errors'
import { SleeperUser } from '@/types'

interface SleeperUserSelectorProps {
  leagueId: string
  disabled?: boolean
  onUserSelect: (userId: string, displayName: string) => void
  onCancel: () => void
}

export default function SleeperUserSelector({ leagueId, disabled = false, onUserSelect, onCancel }: SleeperUserSelectorProps) {
  const [users, setUsers] = useState<SleeperUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    return () => {
      previousFocusRef.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [loading, error])

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError('')

    fetchSleeperLeagueUsers(leagueId, controller.signal)
      .then(userData => {
        setUsers(userData)
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setError('Error fetching league users: ' + getErrorMessage(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [leagueId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabled) {
        onCancel()
        return
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onCancel])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
        <div ref={dialogRef} tabIndex={-1} className="card max-w-md w-full mx-4 p-8 text-center" role="dialog" aria-modal="true" aria-labelledby="sleeper-users-loading-title" aria-busy="true">
          <h3 id="sleeper-users-loading-title" className="text-2xl font-semibold text-white mb-6">Loading league users...</h3>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-blue-500 mx-auto"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
        <div ref={dialogRef} tabIndex={-1} className="card max-w-md w-full mx-4 p-8" role="dialog" aria-modal="true" aria-labelledby="sleeper-users-error-title">
          <h3 id="sleeper-users-error-title" className="text-2xl font-semibold text-red-400 mb-4">Error Loading Users</h3>
          <p className="text-red-300 mb-6" role="alert">{error}</p>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary w-full"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
      <div ref={dialogRef} tabIndex={-1} className="card max-w-md w-full mx-4 max-h-96 flex flex-col p-8" role="dialog" aria-modal="true" aria-labelledby="sleeper-users-title" aria-describedby="sleeper-users-description">
        <h3 id="sleeper-users-title" className="text-2xl font-semibold text-white mb-3">Select Your User</h3>
        <p className="text-slate-400 mb-6 text-sm">
          Choose which user represents you in this league
        </p>

        <div id="sleeper-users-description" className="space-y-3 mb-6 overflow-y-auto min-h-0">
          {users.length === 0 ? (
            <p className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
              No Sleeper users were found for this league.
            </p>
          ) : users.map((user) => (
            <button
              key={user.user_id}
              type="button"
              onClick={() => onUserSelect(user.user_id, user.display_name)}
              disabled={disabled}
              className="w-full text-left bg-slate-700/50 border border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 p-4 rounded-lg transition-colors"
            >
              <div className="font-semibold text-white">{user.display_name}</div>
              <div className="text-sm text-slate-400 mt-1">ID: {user.user_id}</div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="btn btn-secondary w-full"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
