import { readFile, writeFile } from 'node:fs/promises';
const artifact = JSON.parse(await readFile(new URL('../contracts/out/VeloPerpsV4.sol/VeloPerpsV4.json',import.meta.url),'utf8'));
const bytes=(artifact.deployedBytecode.object.length-2)/2;
if(bytes>24576) throw new Error('V4 exceeds EIP-170 deployed code limit');
await writeFile(new URL('../src/services/veloPerpsV4Abi.ts',import.meta.url),
  '// Generated from the compiled VeloPerpsV4 artifact.\nexport const VELO_PERPS_V4_ABI = '+JSON.stringify(artifact.abi,null,2)+' as const;\n');
console.log('Generated V4 ABI; runtime bytecode: '+bytes+' bytes.');
