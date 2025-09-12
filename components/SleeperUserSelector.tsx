'use client'

import { useState, useEffect } from 'react'
import { fetchSleeperLeagueUsers } from '@/lib/api'
import { SleeperUser } from '@/types'

interface SleeperUserSelectorProps {
  leagueId: string
  onUserSelect: (userId: string, displayName: string) => void
  onCancel: () => void
}

export default function SleeperUserSelector({ leagueId, onUserSelect, onCancel }: SleeperUserSelectorProps) {
  const [users, setUsers] = useState<SleeperUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [leagueId])

  const fetchUsers = async () => {
    try {
      const userData = await fetchSleeperLeagueUsers(leagueId)
      setUsers(userData)
    } catch (error: any) {
      setError('Error fetching league users: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="card max-w-md w-full mx-4 p-8 text-center">
          <h3 className="text-2xl font-semibold text-white mb-6">Loading league users...</h3>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-blue-500 mx-auto"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="card max-w-md w-full mx-4 p-8">
          <h3 className="text-2xl font-semibold text-red-400 mb-4">Error Loading Users</h3>
          <p className="text-red-300 mb-6">{error}</p>
          <button
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
      <div className="card max-w-md w-full mx-4 max-h-96 overflow-y-auto p-8">
        <h3 className="text-2xl font-semibold text-white mb-3">Select Your User</h3>
        <p className="text-slate-400 mb-6 text-sm">
          Choose which user represents you in this league
        </p>
        
        <div className="space-y-3 mb-6">
          {users.map((user) => (
            <button
              key={user.user_id}
              onClick={() => onUserSelect(user.user_id, user.display_name)}
              className="w-full text-left bg-slate-700/50 border border-slate-600 hover:bg-slate-700 p-4 rounded-lg transition-colors"
            >
              <div className="font-semibold text-white">{user.display_name}</div>
              <div className="text-sm text-slate-400 mt-1">ID: {user.user_id}</div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="btn btn-secondary w-full"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}