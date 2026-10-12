import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const output = new URL('supabase/functions/velo-api/generated/', root);
const sources = ['sponsor-eth.ts', 'user-stats.ts', 'ga-stats.ts', 'protocol-stats.ts', 'og.js', 'post-og.ts'];

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
const result = await build({
  entryPoints: [fileURLToPath(new URL('supabase/functions/velo-api/index.js', root))],
  outfile: fileURLToPath(new URL('supabase/functions/velo-api/bundle.js', root)),
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
console.log(`Bundled ${sources.length} API handlers for Supabase; keeper jobs are not deployed by this build.`);
