// Offline UI fixtures only. Every signer, balance service and contact write is replaced.
export const walletDialogFixturePlugin={name:'wallet-dialog-fixture',setup(build){
 const stubs={
  wagmi:`const f=()=>globalThis.__walletFixture;export const useAccount=()=>({address:f().owner,connector:{name:'Test wallet'}});export const usePublicClient=()=>f().client;export const useWalletClient=()=>({data:f().wallet});export const useChainId=()=>84532;export const useSwitchChain=()=>({switchChainAsync:async()=>{}});export const useSignMessage=()=>({signMessageAsync:async()=>''});export const useBalance=()=>({data:{value:1000000000000000000n}});export const useReadContract=({args})=>({data:args?.[0]===f().owner?100000000n:200000000n});`,
  viem:`export const isAddress=x=>/^0x[0-9a-f]{40}$/i.test(x);export const createWalletClient=()=>globalThis.__walletFixture.wallet;export const http=()=>({});export const createPublicClient=()=>globalThis.__walletFixture.client;export const parseUnits=(v,d)=>BigInt(Math.round(Number(v)*10**d));export const formatUnits=(v,d)=>String(Number(v)/10**d);`,
  'viem/accounts':`export const privateKeyToAccount=()=>({address:globalThis.__walletFixture.burner.veloAddress});`,
  veloBurnerWallet:`export const loadStoredBurner=()=>globalThis.__walletFixture.burner;export const exportPrivateKey=()=>{globalThis.__walletFixture.exports++;return 'test-only-key';};export const rederiveVeloBurner=async()=>{globalThis.__walletFixture.recoveries++;return globalThis.__walletFixture.burner;};`,
  veloUsdcService:`export const fetchUsdcBalance=async(_c,_t,a)=>a===globalThis.__walletFixture.owner?100:200;export const fetchFaucetCooldown=async()=>({availableAt:0});export const transferUsdc=async(...args)=>{globalThis.__walletFixture.transfers.push(args);return globalThis.__walletFixture.hash;};export const VELO_USDC_ABI=[];`,
  veloPerpsService:`export const VELO_USDC_BASE='0x3333333333333333333333333333333333333333';export const baseScanAddressUrl=a=>'https://sepolia.basescan.org/address/'+a;export const baseScanTxUrl=h=>'https://sepolia.basescan.org/tx/'+h;`,
  veloGasSponsor:`export const requireBurnerGas=async()=>{};export const ensureBurnerGas=async()=>({ok:true});`,
  'baseTransport.mjs':`export const baseSepoliaTransport=()=>({});export const submittedTransactionHash=()=>null;export const pendingTransaction=()=>null;`,
  tradeReceipts:`export const waitForSuccessfulReceipt=async()=>{globalThis.__walletFixture.receiptRequests++;return globalThis.__walletFixture.receipt;};`,
  bridgeService:`export const CHAIN_ID={base_sepolia:84532,arbitrum_sepolia:421614,optimism_sepolia:11155420,ethereum_sepolia:11155111};export const CHAIN_LABEL={base_sepolia:'Base Sepolia',arbitrum_sepolia:'Arbitrum Sepolia',optimism_sepolia:'Optimism Sepolia',ethereum_sepolia:'Ethereum Sepolia'};export const VELO_USDC_ADDRESS={};export const quoteBridge=async()=>({nativeFee:1000n});export const executeBridge=async(...args)=>{globalThis.__walletFixture.bridges.push(args);return {txHash:globalThis.__walletFixture.hash};};`,
  usernameService:`export const validateUsername=()=>null;export const resolveUsername=async()=>null;`,
  supabaseStore:`export const isConfigured=()=>true;export const supabase={rpc:async(name,args)=>{globalThis.__walletFixture.rpc.push({name,args});return {data:name==='get_my_contact_email'?'old@example.test':null,error:null};}};export const publicSupabase={};`,
  veloBurnerSetup:`export const setupBurnerWallet=async()=>{globalThis.__walletFixture.claims++;return {burner:globalThis.__walletFixture.burner,faucetTxHash:globalThis.__walletFixture.hash};};`,
  'baseBuilderAttribution.mjs':`export const builderAttribution=()=>({});`,
 };
 build.onResolve({filter:/.*/},args=>{const key=Object.hasOwn(stubs,args.path)?args.path:args.path.split('/').pop();if(Object.hasOwn(stubs,key))return{path:key,namespace:'wallet-fixture'};});
 build.onLoad({filter:/.*/,namespace:'wallet-fixture'},args=>({contents:stubs[args.path],resolveDir:process.cwd()}));
}};
