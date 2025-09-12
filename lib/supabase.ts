import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      user_leagues: {
        Row: {
          id: number
          user_id: string
          sleeper_league_id: string
          sleeper_user_id: string | null
          league_name: string | null
          custom_nickname: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          sleeper_league_id: string
          sleeper_user_id?: string | null
          league_name?: string | null
          custom_nickname?: string | null
        }
        Update: {
          sleeper_league_id?: string
          league_name?: string | null
          custom_nickname?: string | null
        }
      }
    }
  }
}