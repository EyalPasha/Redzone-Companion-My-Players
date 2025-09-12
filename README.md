# RedZone Companion 🏈

A professional fantasy football tracking application that allows you to monitor your players across multiple Sleeper leagues during live NFL games. Perfect for RedZone viewing sessions!

![RedZone Companion](public/logo.png)

## ✨ Features

- **Multi-League Support**: Track players across multiple Sleeper fantasy leagues
- **Live Game Tracking**: Monitor your players during live NFL games with ESPN integration
- **Player Management**: View both your players and opponents' players by game
- **Game Configuration**: Show/hide specific games and customize display order
- **Player Headshots**: Visual player identification with Sleeper CDN integration  
- **Keyboard Shortcuts**: Quick game selection with 1-9, A-Z hotkeys
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Caching System**: Smart data caching to minimize API calls
- **Weather Integration**: Highlight adverse weather conditions that may affect gameplay

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd redzone-companion
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your Supabase credentials:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Set up database tables**

   Run this SQL in your Supabase SQL editor:

   ```sql
   -- Create user_leagues table
   CREATE TABLE user_leagues (
     id SERIAL PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     sleeper_league_id TEXT NOT NULL,
     sleeper_user_id TEXT,
     league_name TEXT,
     custom_nickname TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
   );

   -- Enable RLS
   ALTER TABLE user_leagues ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY "Users can view their own leagues" ON user_leagues
     FOR SELECT USING (auth.uid() = user_id);

   CREATE POLICY "Users can insert their own leagues" ON user_leagues
     FOR INSERT WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "Users can update their own leagues" ON user_leagues
     FOR UPDATE USING (auth.uid() = user_id);

   CREATE POLICY "Users can delete their own leagues" ON user_leagues
     FOR DELETE USING (auth.uid() = user_id);
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 🏗️ Architecture

### Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS
- **APIs**:
  - ESPN API (NFL game data)
  - Sleeper API (fantasy league data)

### Key Components

- `Dashboard`: League management and configuration
- `RedZoneView`: Main game tracking interface
- `GameConfigModal`: Game visibility and ordering settings
- `SleeperUserSelector`: User identification for leagues
- `AuthForm`: Authentication interface

## 🎮 Usage

### Getting Started

1. **Sign Up/Login**: Create an account or sign in
2. **Add Leagues**: Add your Sleeper league IDs from the dashboard
3. **User Selection**: Choose your user identity in each league
4. **Start Tracking**: Click "Start RedZone Session"

### Game Tracking

- **Select Games**: Click game buttons or use keyboard shortcuts (1-9, A-Z)
- **Configure Games**: Hide/show games and customize order
- **View Players**: See your players and opponents organized by team
- **Refresh Data**: Update game and lineup information

### League Management

- **Add Leagues**: Enter Sleeper League ID (found in Sleeper app settings)
- **Nicknames**: Add custom nicknames for easy identification
- **Edit/Remove**: Manage your league list

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key | Yes |

### Game Windows

The app automatically filters games into early and late windows:

- **Early Window**: Games starting at 7:00-8:00 PM (Israel time)
- **Late Window**: Games starting at 10:00-11:50 PM (Israel time)
- **Sunday Only**: Window filtering only applies to Sunday games

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms

The app is a standard Next.js application and can be deployed to:

- Netlify
- Railway
- AWS
- Google Cloud Platform
- Any Node.js hosting provider

## 🔗 API Integration

### Sleeper API

- **League Data**: User rosters, matchups, and league information
- **Player Data**: NFL player information and metadata
- **Rate Limiting**: Cached locally to minimize API calls

### ESPN API  

- **Game Data**: Live NFL scores, schedules, and game information
- **Weather Data**: Stadium conditions and weather information
- **No Authentication**: Public API endpoints

## 📱 Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues or questions:

1. Check existing GitHub issues
2. Create a new issue with detailed description
3. Include steps to reproduce any bugs

## 🙏 Acknowledgments

- [Sleeper](https://sleeper.app) for their comprehensive fantasy football API
- [ESPN](https://espn.com) for NFL game data
- [Supabase](https://supabase.io) for backend infrastructure
- [Next.js](https://nextjs.org) team for the amazing framework

## 📸 Screenshots

imgs\header.png
imgs\start.png
imgs\players2.png
imgs\players1.png
imgs\config.png
