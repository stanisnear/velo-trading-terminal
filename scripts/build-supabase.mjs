import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const output = new URL('supabase/functions/velo-api/generated/', root);
const sources = ['user-stats.ts', 'ga-stats.ts', 'protocol-stats.ts', 'og.js', 'post-og.ts'];

// Transform syntax rather than substituting secret values at build time.
// No environment variable values are read by this build.
const environmentTransformer = context => sourceFile => {
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'process' &&
        node.expression.name.text === 'env') {
      return ts.factory.createCallExpression(ts.factory.createIdentifier('runtimeEnv'), undefined,
        [ts.factory.createStringLiteral(node.name.text)]);
    }
    return ts.visitEachChild(node, visit, context);
  };
  return ts.visitNode(sourceFile, visit);
};

await mkdir(output, { recursive: true });
for (const source of sources) {
  const original = await readFile(new URL(`api/${source}`, root), 'utf8');
  const result = ts.transpileModule(original, {
    fileName: source,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [environmentTransformer] },
    reportDiagnostics: true,
  });
  const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) || [];
  if (errors.length) throw new Error(ts.formatDiagnostics(errors, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => fileURLToPath(root), getNewLine: () => '\n',
  }));
  let code = result.outputText.replace(/from (['"])crypto\1/g, "from 'node:crypto'");
  if (/process\s*(?:\.\s*env|\[)/.test(code)) throw new Error(`Unsupported dynamic process.env access in ${source}`);
  const preamble = `// Generated from api/${source}; run npm run build:supabase. Do not edit.\n` +
    `import { runtimeEnv } from '../env.js';\n` +
    (source === 'ga-stats.ts' ? `import { Buffer } from 'node:buffer';\n` : '');
  await writeFile(new URL(source.replace(/\.ts$/, '.js'), output), preamble + code);
}
// viem's locked dependency graph includes a URL dependency that the hosted Deno
// npm resolver cannot parse. Bundle the existing npm-lockfile dependencies here
// so Supabase receives self-contained ESM, without changing contract libraries.
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
// Reuse the reviewed contract layouts from the existing handlers; do not
// hand-copy a struct layout that could decode the wrong fields.
const keeperOutput = new URL('supabase/functions/velo-keepers/generated/', root);
await mkdir(keeperOutput, { recursive: true });
const definitions = [
  ['cron-conditional-orders.ts', { V3_ABI: 'ORDER_ABI', PYTH_FEE_ABI: 'PYTH_FEE_ABI' }],
  ['cron-tp-sl.ts', { CORE_ABI: 'TP_CORE', POSITION_V3_ABI: 'POSITION_V3_ABI', POSITION_V2_ABI: 'POSITION_V2_ABI' }],
  ['cron-liquidate.ts', { CORE_ABI: 'LIQ_CORE' }],
];
let abiSource = '// Generated contract ABI layouts from api/cron-*.ts.\n';
for (const [filename, names] of definitions) {
  const text = await readFile(new URL(`api/${filename}`, root), 'utf8');
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const found = new Set();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(source);
      if (names[name] && declaration.initializer) {
        abiSource += `export const ${names[name]} = ${declaration.initializer.getText(source)};\n`;
        found.add(name);
      }
    }
  }
  if (Object.keys(names).some(name => !found.has(name))) throw new Error(`Missing ABI definition in ${filename}`);
}
abiSource += 'export const CORE_ABI = [...new Map([...TP_CORE, ...LIQ_CORE].map(f => [f.name, f])).values()];\n';
await writeFile(new URL('abi.js', keeperOutput), abiSource);
for (const name of ['velo-api', 'velo-keepers']) {
const result = await build({
  entryPoints: [fileURLToPath(new URL(`supabase/functions/${name}/index.js`, root))],
  outfile: fileURLToPath(new URL(`supabase/functions/${name}/bundle.js`, root)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  metafile: true,
  plugins: [{ name: 'explicit-node-builtins', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      const name = args.path.replace(/^node:/, '');
      if (builtins.has(name)) return { path: `node:${name}`, external: true };
    });
  } }],
});
for (const output of Object.values(result.metafile.outputs)) {
  if (output.imports.some(item => item.external && !item.path.startsWith('node:'))) {
    throw new Error('The Supabase bundle contains an unresolved package import');
  }
}
}
console.log('Built velo-api and velo-keepers. No secrets read, transactions sent, or schedules enabled.');
