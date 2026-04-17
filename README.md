# VELO — SocialFi Exchange

Social perpetual futures trading platform. React + TypeScript + Vite + Supabase + TradingView.

## Quick Start

```bash
npm install
npm run dev
```

## Supabase Setup

1. Project URL: `https://lhxserclykazheonpvjj.supabase.co`
2. Disable email confirmation: Auth → Settings → Email → OFF
3. Enable realtime: SQL Editor → `alter publication supabase_realtime add table posts;`
4. Create storage bucket: Storage → New → "avatars" (public)

## Project Structure

```
src/
├── App.tsx                    # Main app (being modularized)
├── index.tsx                  # Entry point
├── components/
│   ├── AuthModal.tsx          # Sign up / Sign in
│   ├── OrderBook.tsx          # Depth visualization
│   ├── PortfolioChart.tsx     # Equity chart
│   └── TradingViewChart.tsx   # TradingView widget
├── services/
│   ├── geminiService.ts       # AI integration
│   ├── mockStore.ts           # Local data simulation
│   ├── priceService.ts        # CoinGecko real-time
│   └── supabase.ts            # Auth + DB + Storage
└── utils/
    └── types.ts               # Type definitions + PAIRS config
```

## Deploy

Push to GitHub → Vercel auto-deploys.

Live: [velo-prototype.vercel.app](https://velo-prototype.vercel.app)
