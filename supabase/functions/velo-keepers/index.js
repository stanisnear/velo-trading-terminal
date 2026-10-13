import { runtimeEnv } from '../velo-api/env.js';
import { createKeepers } from './bridge.js';
import { runKeeper } from './engine.js';
import { keeperTokenHash } from '../_shared/token-verifiers.js';
Deno.serve(createKeepers({ getEnv: runtimeEnv, run: runKeeper, tokenHash: keeperTokenHash }));
