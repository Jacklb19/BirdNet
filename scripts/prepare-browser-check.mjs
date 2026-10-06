import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Keep the browser fixture out of the production build; generate it only for local verification.
const projectRoot = path.resolve(import.meta.dirname, '..');
const productionHtml = fs.readFileSync(path.join(projectRoot, 'dist/index.html'), 'utf8');
const appScript = productionHtml.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const styleSheet = productionHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!appScript || !styleSheet) throw new Error('Build the application before preparing the browser check.');

const fixtureDir = path.join(projectRoot, 'src/test/browser');
const metadata = fs.readFileSync(path.join(projectRoot, 'public/test-audio/metadata.json'), 'utf8');
const referenceFiles = JSON.parse(metadata).map((reference) => `public/test-audio/${reference.filename}`);
for (const localFile of ['public/models/birdnet_model.onnx', ...referenceFiles]) {
  if (!fs.existsSync(path.join(projectRoot, localFile))) throw new Error(`Missing local reference asset: ${localFile}`);
}
const source = fs.readFileSync(path.join(fixtureDir, 'listening.ts'), 'utf8')
  .replace(/^import .+;\r?\n/gm, '')
  .replace('createRoot(root).render(createElement(App));', '')
  .replace('const status =', `const metadata = ${metadata};\nconst status =`);
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const fixtureHtml = fs.readFileSync(path.join(fixtureDir, 'listening.html'), 'utf8')
  .replace('</head>', `<link rel="stylesheet" href="${styleSheet}"></head>`)
  .replace('<script type="module" src="./listening.ts"></script>',
    `<script type="module">${javascript}</script><script type="module" src="${appScript}"></script>`);
fs.writeFileSync(path.join(projectRoot, 'dist/sprint3-check.html'), fixtureHtml);
process.stdout.write('Production browser check: http://127.0.0.1:9013/sprint3-check.html\n');
