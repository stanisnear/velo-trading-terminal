// Public deployment metadata verified against Base Sepolia on 2026-10-13.
// Environment settings override these reviewed defaults. No secret belongs here.
export const publicConfig = Object.freeze({
  VITE_VELO_PERPS_ADDRESS: '0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163',
  VITE_VELO_PERPS_V2_ADDRESS: '0x8d4b792137252d79fb3ae953aa619fa57101665f',
  // Match the current frontend source's V3.1 default; VERSION() returns 31.
  VITE_VELO_PERPS_V3_ADDRESS: '0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907',
  VITE_VELO_PERPS_V3_1_ADDRESS: '0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907',
  VITE_KEEPER_ADDRESS: '0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b',
  PYTH_CONTRACT_ADDRESS: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
  MUSDC_ADDRESS: '0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699',
  VITE_PYTH_HERMES_URL: 'https://hermes.pyth.network',
  // Activated after the owner paused Vercel and nonce 197 had no pending tx.
  VELO_KEEPERS_ENABLED: 'true',
  VELO_SPONSOR_ENABLED: 'true',
  // Owner supplied the original sponsor key; its derived address matches the
  // already imported PRIVATE_KEY. Reuse it only while this public address matches.
  VELO_SPONSOR_USE_KEEPER_KEY: 'true',
  VELO_SPONSOR_EXPECTED_ADDRESS: '0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b',
});
