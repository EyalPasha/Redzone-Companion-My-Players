// Sleeper API Types
export interface SleeperLeague {
  league_id: string
  name: string
  roster_positions: string[]
  sport: string
  season: string
  season_type: string
  total_rosters: number
  status: string
}

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar?: string
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string
  league_id: string
  players: string[]
  starters: string[]
  reserve?: string[]
  taxi?: string[]
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number
  points: number
  starters: string[]
  players_points?: Record<string, number>
}

// ESPN API Types
export interface ESPNGame {
  id: string
  uid: string
  date: string
  name: string
  shortName: string
  season: {
    year: number
    type: number
  }
  week: {
    number: number
  }
  competitions: [{
    id: string
    uid: string
    date: string
    attendance: number
    type: {
      id: string
      abbreviation: string
    }
    timeValid: boolean
    neutralSite: boolean
    conferenceCompetition: boolean
    playByPlayAvailable: boolean
    recent: boolean
    venue: {
      id: string
      fullName: string
      address: {
        city: string
        state: string
      }
      capacity: number
      indoor: boolean
    }
    competitors: [{
      id: string
      uid: string
      type: string
      order: number
      homeAway: string
      team: {
        id: string
        uid: string
        location: string
        name: string
        abbreviation: string
        displayName: string
        shortDisplayName: string
        color: string
        alternateColor: string
        isActive: boolean
        venue: {
          id: string
        }
        links: Array<{
          language: string
          rel: string[]
          href: string
          text: string
          shortText: string
          isExternal: boolean
          isPremium: boolean
        }>
        logo: string
      }
      score: string
      statistics: any[]
      records: Array<{
        name: string
        abbreviation: string
        type: string
        summary: string
      }>
    }]
    notes: any[]
    status: {
      clock: number
      displayClock: string
      period: number
      type: {
        id: string
        name: string
        state: string
        completed: boolean
        description: string
        detail: string
        shortDetail: string
      }
    }
    broadcasts: Array<{
      market: string
      names: string[]
    }>
    leaders: Array<{
      name: string
      displayName: string
      shortDisplayName: string
      abbreviation: string
      leaders: Array<{
        displayValue: string
        value: number
        athlete: {
          id: string
          fullName: string
          displayName: string
          shortName: string
          links: Array<{
            rel: string[]
            href: string
          }>
          headshot: string
          jersey: string
          position: {
            abbreviation: string
          }
          team: {
            id: string
          }
          active: boolean
        }
        team: {
          id: string
        }
      }>
    }>
  }]
  links: Array<{
    language: string
    rel: string[]
    href: string
    text: string
    shortText: string
    isExternal: boolean
    isPremium: boolean
  }>
  weather: {
    displayValue: string
    temperature: number
    highTemperature: number
    conditionId: string
    link: {
      language: string
      rel: string[]
      href: string
      text: string
      shortText: string
      isExternal: boolean
      isPremium: boolean
    }
  }
}

export interface ESPNScoreboard {
  leagues: Array<{
    id: string
    uid: string
    name: string
    abbreviation: string
    slug: string
    season: {
      year: number
      startDate: string
      endDate: string
      displayName: string
      type: {
        id: string
        type: number
        name: string
        abbreviation: string
      }
    }
    logos: Array<{
      href: string
      width: number
      height: number
      alt: string
      rel: string[]
      lastUpdated: string
    }>
    calendarType: string
    calendarIsWhitelist: boolean
    calendarStartDate: string
    calendarEndDate: string
    calendar: string[]
  }>
  season: {
    type: number
    year: number
  }
  week: {
    number: number
  }
  events: ESPNGame[]
}

// App Types
export interface UserLeague {
  id: number
  user_id: string
  sleeper_league_id: string
  sleeper_user_id: string | null
  league_name: string | null
  custom_nickname: string | null
  created_at: string
  updated_at: string
}

export interface GameDisplay {
  gameId: string
  homeTeam: {
    name: string
    abbreviation: string
    logo: string
  }
  awayTeam: {
    name: string
    abbreviation: string
    logo: string
  }
  status: string
  time: string
  keyboardNumber: string
}

export interface PlayerLineup {
  playerId: string
  name: string
  position: string
  team: string
  jerseyNumber?: string
  leagueIds: string[]
  leagueNames: string[]
  isOpponent: boolean
}