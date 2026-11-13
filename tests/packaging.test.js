import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const manifest = JSON.parse(await read('package.json'));

test('controlled 0.2.2 admission stays consistent across release metadata', async () => {
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(lock.packages[''].engines, manifest.engines);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
  const readme = await read('README.md');
  assert.ok(readme.includes(`\`${manifest.engines.dsh}\``));
  assert.ok(readme.includes('excludes 0.2.3, including its prereleases'));
  assert.ok(!readme.includes('0.2.2-rc.1 || 0.2.2-rc.2'));
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, '0.2.2-rc.1', name);
  }
});

const screenshotNames = ['logo-studio-open-editor.png', 'logo-studio-editor.png'];

test('README screenshots are local PNG resources with readable alternative text', async () => {
  assert.ok(manifest.files.includes('docs/images/*.png'));
  const readme = await read('README.md');
  assert.match(readme, /Customize logo.*highlighted in red/);
  for (const name of screenshotNames) {
    const path = `docs/images/${name}`;
    assert.ok(readme.includes(`](<${path}>)`), path);
    const bytes = await readFile(new URL(path, root));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], name);
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, name);
  }
});

test('public GitHub source package preserves installed identity and requires no install build', async () => {
  assert.equal(manifest.name, '@local/dsh-logo-studio');
  assert.equal(manifest.version, '0.2.1');
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository.url, 'https://github.com/EdgarSantiago/dsh-logo-studio.git');
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.1 <0.2.3-0');
  assert.ok(manifest.keywords.includes('dsh-plugin'));
  for (const hook of ['install', 'postinstall', 'prepare', 'prepack']) assert.equal(manifest.scripts[hook], undefined);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.exports['./icon'], './icon.svg');
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');
  assert.ok(!(await read('.gitignore')).split(/\r?\n/).includes('dist/'));
  for (const artifact of ['dist/client.js', 'dist/client.js.map']) assert.doesNotMatch(await read(artifact), /(?:\/Users\/|\/home\/|[A-Z]:\\\\Users\\\\)/, artifact);
  for (const tag of ['en', 'pt', 'pt-BR', 'zh', 'ja', 'es', 'fr', 'de', 'ru']) {
    const locale = JSON.parse(await read(`locale/${tag}.json`));
    assert.ok(locale.meta.title && locale.meta.description);
  }
  assert.ok((await read('README.md')).includes('dsh plugin --profile web add github:EdgarSantiago/dsh-logo-studio'));
  assert.ok((await read('README.md')).includes('dsh plugin --profile desktop add github:EdgarSantiago/dsh-logo-studio'));
});

test('source-only pack contains complete runtime and license resources without private output', () => {
  const output = execFileSync('npm', ['--cache', 'node_modules/.cache/npm', 'pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 60000 });
  const [packed] = JSON.parse(output);
  const files = new Set(packed.files.map(file => file.path));
  for (const file of ['index.js', 'dist/client.js', 'dist/client.js.map', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/pt.json', 'LICENSE', 'THIRD_PARTY.md', 'README.md']) assert.ok(files.has(file), file);
  for (const tag of ['en', 'pt', 'pt-BR', 'zh', 'ja', 'es', 'fr', 'de', 'ru']) assert.ok(files.has(`locale/${tag}.json`), tag);
  for (const name of screenshotNames) assert.ok(files.has(`docs/images/${name}`), name);
  assert.ok(![...files].some(path => /node_modules|test-results|\.tgz$|\.log$/.test(path)));
});
