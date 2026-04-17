# VELO — SocialFi Exchange Prototype

Social perpetual futures trading on Solana. Built with React, TypeScript, Vite, Supabase, and TradingView.

## Features

- **TradingView Charts** — Full Advanced Chart with 100+ indicators, drawing tools
- **Real-Time Prices** — CoinGecko API + TradingView Binance feed
- **Perpetual Futures** — Leverage 1-100x, market/limit/stop, TP/SL
- **Social Feed** — Posts, likes, reposts, trade signals
- **Copy Trading** — Mirror top traders' positions
- **AI Trading Bots** — Automated strategies
- **Auth** — Supabase sign up/sign in (falls back to demo mode)
- **Dashboard** — Portfolio, equity chart, bot management

## Setup

```bash
npm install
npm run dev
```

### Supabase (optional)

Create `.env.local` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

App works in demo mode without Supabase configured.

## Deploy

Push to GitHub → Vercel auto-deploys. Add env vars in Vercel Settings.

## Live: [velo-prototype.vercel.app](https://velo-prototype.vercel.app)
