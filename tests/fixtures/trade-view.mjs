export const tradeProps = {
  activePair: { id: 'HYPE/USD', name: 'Hyperliquid', basePrice: 81.5 },
  marketPrices: { 'HYPE/USD': 81.5 }, marketChanges: { 'HYPE/USD': 2.5 }, candles: {},
  user: { id: 'fixture', balance: 1191.85, tradeHistory: [] }, positions: [], openOrders: [],
  isLiveMode: true, orderlyIsReady: true, orderlyBalance: 1191.85,
};

// Use the real ticket and shared inputs, without an RPC, wallet or transaction signer.
export const tradeFixturePlugin = {
  name: 'trade-view-fixture',
  setup(build) {
    const stubs = {
      wagmi: 'export const useReadContract=()=>({data:[100000000000n,0n,0n,10n,50n,0n,1n],isError:false});',
      testnetReleaseGate: 'export const LEGACY_V31_RESTRICTED=true;',
      veloPerpsService: "export const IS_V4=true,PAIR_INDEX={'HYPE-USD':7},VELO_PERPS_V4_ADDRESS='0x01',baseScanTxUrl=h=>'https://sepolia.basescan.org/tx/'+h;",
      TradingViewChart: "export const TradingViewChart=()=>null, TV_INTERVALS={'1m':1},TV_INTERVALS_QUICK={'1m':1},CHART_STYLES=[],INDICATORS=[];",
      OrderBook: "import React from 'react'; export const OrderBook=()=>React.createElement('div',{style:{padding:12,fontSize:11}},'TRADES / VOLUME / ORDERS');",
      OrderDetailsModal: 'export const OrderDetailsModal=()=>null;',
    };
    build.onResolve({ filter: /.*/ }, args => {
      const key = args.path.split('/').pop();
      if (stubs[key]) return { path: key, namespace: 'fixture' };
    });
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], resolveDir: process.cwd() }));
  },
};
