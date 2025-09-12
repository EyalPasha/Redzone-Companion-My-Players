# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added
- **Multi-League Support**: Track players across multiple Sleeper fantasy leagues
- **Live Game Tracking**: Monitor players during live NFL games with ESPN API integration
- **Player Management**: View both user and opponent players organized by game/team
- **Game Configuration**: Show/hide specific games and customize display order
- **Player Headshots**: Visual player identification with Sleeper CDN integration
- **Keyboard Shortcuts**: Quick game selection with 1-9, A-Z hotkeys
- **Responsive Design**: Full mobile, tablet, and desktop support
- **Smart Caching**: Minimize API calls with intelligent data caching (30-minute expiry)
- **Weather Integration**: Highlight adverse weather conditions affecting gameplay
- **User Authentication**: Secure login/signup with Supabase Auth
- **League Nicknames**: Custom nicknames for easy league identification
- **Real-time Updates**: Refresh data on demand for current game states

### Features
- **Sunday Game Windows**: Automatic filtering for early (7PM-8PM) and late (10PM-11:50PM) windows
- **User Selection**: Choose your identity in each league during setup
- **Data Persistence**: Local storage for UI preferences and cached data
- **Error Handling**: Graceful handling of API failures and network issues
- **Loading States**: Clear feedback during data fetching operations

### Technical
- **Framework**: Next.js 15 with App Router
- **Database**: Supabase with Row Level Security
- **Styling**: Tailwind CSS with dark theme
- **TypeScript**: Full type safety throughout the application
- **APIs**: ESPN (NFL data) and Sleeper (fantasy data) integration
- **Performance**: Image optimization, code splitting, and bundle optimization
- **Security**: HTTP security headers and secure authentication flow