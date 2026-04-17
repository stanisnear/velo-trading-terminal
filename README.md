# VELO — Trading Terminal Prototype

A real-time crypto perpetual futures trading terminal built with React + Vite. Live market data from CoinGecko API.

![VELO Screenshot](https://img.shields.io/badge/Status-Prototype-blue)

## Features

- **Real-time prices** — CoinGecko API with 15s polling + micro-simulation
- **16 trading pairs** — BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, RNDR, TIA, SUI, WIF, PEPE, JUP, BONK, PYTH
- **Professional chart** — Candles/Line/Area with SMA, EMA, Bollinger Bands indicators
- **Order book** — Simulated depth with cumulative totals
- **Full trading engine** — Market/Limit/Stop orders, leverage 1-125x, TP/SL, liquidation
- **Demo mode** — $10,000 starting balance

## Tech Stack

- React 19 + Vite 6
- CoinGecko API (free, no key needed)
- Custom SVG charting engine
- Deployed on Vercel

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`

## Deploy to Vercel

Push to GitHub, then import in Vercel — zero config needed.

Or via CLI:

```bash
npm i -g vercel
vercel
```

## Project Structure

```
src/
├── App.jsx                    # Main app composition
├── main.jsx                   # React entry point
├── components/
│   ├── TradingChart.jsx       # SVG chart + indicators + crosshair
│   ├── OrderBook.jsx          # Depth visualization
│   ├── OrderForm.jsx          # Trading controls (margin, leverage, TP/SL)
│   ├── PositionsPanel.jsx     # Open positions + trade history
│   ├── PairSelector.jsx       # Market selector modal
│   └── UI.jsx                 # Header, Toast, Login modal
├── hooks/
│   └── useTrading.jsx         # Position management, PnL, TP/SL engine
├── services/
│   └── priceService.jsx       # CoinGecko real-time price feed
└── utils/
    ├── constants.jsx           # Pairs config, leverage options
    └── helpers.jsx             # Formatting, calculations, indicators
```

## License

MIT
