# VELO — SocialFi Exchange Prototype

A full-featured social perpetual futures trading platform prototype built with React, TypeScript, and Vite. Live market data from CoinGecko.

## Features

- **Trading Terminal** — Perpetual futures with leverage 1-100x, market/limit/stop orders, TP/SL
- **Real-Time Prices** — CoinGecko API with 15s polling + micro-simulation between calls
- **Interactive Chart** — Powered by lightweight-charts with candle/area views, SMA indicator, timeframes
- **Order Book** — Dynamic depth visualization  
- **Social Feed** — Twitter/CT-style feed with posts, likes, reposts, comments, trade signals
- **Copy Trading** — Follow and auto-copy top traders' positions
- **AI Trading Bots** — Deploy automated strategies with configurable risk levels
- **Leaderboard** — Ranked traders by PnL with profiles
- **Dashboard** — Portfolio overview, equity chart, active positions, bot/copy trade management
- **Profile System** — User profiles with trade history, followers, following

## Tech Stack

- React 19 + TypeScript + Vite
- lightweight-charts (TradingView charting)
- Tailwind CSS (CDN)
- CoinGecko API (free, no key needed)
- Lucide React icons

## Local Development

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub → auto-deploys on Vercel. Zero config needed.

## Live Demo

[velo-prototype.vercel.app](https://velo-prototype.vercel.app)
