import { runtimeEnv } from '../velo-api/env.js';
import { createKeepers } from './bridge.js';
import { runKeeper } from './engine.js';
Deno.serve(createKeepers({ getEnv: runtimeEnv, run: runKeeper }));
