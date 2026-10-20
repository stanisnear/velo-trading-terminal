// Reconstruct the exact compiler input from the deployed build metadata.
import { readFile, writeFile } from 'node:fs/promises';
import { keccak256, stringToHex, encodeAbiParameters } from 'viem';

const root = new URL('../', import.meta.url);
const artifact = JSON.parse(await readFile(new URL('contracts/out/VeloPerpsV4.sol/VeloPerpsV4.json', root)));
const metadata = artifact.metadata;
const sources = {};
for (const [path, source] of Object.entries(metadata.sources)) {
  const content = await readFile(new URL(`contracts/${path}`, root), 'utf8');
  if (keccak256(stringToHex(content)) !== source.keccak256) throw Error(`Source changed since compilation: ${path}`);
  sources[path] = { content };
}
const { compilationTarget, ...settings } = metadata.settings;
const payload = {
  stdJsonInput: { language: 'Solidity', sources, settings },
  compilerVersion: metadata.compiler.version,
  contractIdentifier: 'src/VeloPerpsV4.sol:VeloPerpsV4',
  creationTransactionHash: '0xc6a9feeee308e0428509ac66c3e82f203a245361a35d36585eaf316e27b4ca93',
};
await writeFile(new URL('audit/v4-verification-input.json', root), JSON.stringify(payload));
const address = '0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f';
const constructorArguments = encodeAbiParameters(
  [{ type:'address' }, { type:'address' }, { type:'address' }, { type:'address' }],
  ['0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699','0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
   '0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b','0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b'],
).slice(2);
if (process.argv.includes('--etherscan')) {
  if (!process.env.ETHERSCAN_API_KEY) throw Error('Configure ETHERSCAN_API_KEY securely; never commit it.');
  const body = new URLSearchParams({
    module:'contract', action:'verifysourcecode', chainid:'84532', apikey:process.env.ETHERSCAN_API_KEY,
    contractaddress:address, sourceCode:JSON.stringify(payload.stdJsonInput),
    contractname:payload.contractIdentifier, compilerversion:`v${payload.compilerVersion}`,
    codeformat:'solidity-standard-json-input', optimizationUsed:'1', runs:'200',
    constructorArguments, evmVersion:'shanghai', licenseType:'3',
  });
  const result = await fetch(`https://api.etherscan.io/v2/api?chainid=84532&apikey=${encodeURIComponent(process.env.ETHERSCAN_API_KEY)}`, { method:'POST', body, signal:AbortSignal.timeout(60000) });
  console.log(JSON.stringify(await result.json()));
} else {
  const response = await fetch(`https://sourcify.dev/server/v2/verify/84532/${address}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(60000),
  });
  const result = await response.json();
  console.log(JSON.stringify({ status:response.status, ...result }));
}
