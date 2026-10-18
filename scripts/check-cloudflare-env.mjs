// Fails the build early if a required public (VITE_*) setting is missing.
// Values are never printed.
const required = [
  'VITE_WALLETCONNECT_PROJECT_ID',
  'VITE_PYTH_HERMES_URL',
  'VITE_VELO_PERPS_ADDRESS',
  'VITE_VELO_PERPS_V3_ADDRESS',
  'VITE_VELO_PERPS_V3_1_ADDRESS',
  'VITE_VELO_REGISTRY_ADDRESS',
  'VITE_KEEPER_ADDRESS',
  'VITE_VELO_USDC_BASE',
  'VITE_VELO_USDC_ETH',
  'VITE_VELO_USDC_OP',
  'VITE_VELO_USDC_ARB',
  'VITE_BASE_SEPOLIA_RPC_URL',
  'VITE_ETH_SEPOLIA_RPC_URL',
  'VITE_OP_SEPOLIA_RPC_URL',
  'VITE_ARB_SEPOLIA_RPC_URL',
  'VITE_VELO_PERPS_V2_ADDRESS',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error('Missing build variables (values are never printed):\n' + missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`All ${required.length} public build settings are present.`);
}
