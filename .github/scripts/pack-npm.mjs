// OpenCode publication tooling only; excluded from installed payloads.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const NAME = '@fotor-ai/opencode-fotor-plugin';
export const REPOSITORY = 'https://github.com/fotor-ai/opencode-fotor-plugin';
export const NPM_VERSION = '11.21.1';
export const NODE_VERSION = '24.17.0';
export const SDK_RANGE = '>=2.2.5 <3';
export const RELEASE_FILES = ['.github/workflows/publish-npm.yml',
  '.github/scripts/pack-npm.mjs', '.github/scripts/release-gate.mjs'];
export const SKILLS = ['fotor-audio', 'fotor-connect', 'fotor-credits', 'fotor-image', 'fotor-upload', 'fotor-video'];
const REFERENCES = ['authentication.md', 'credits.md', 'mcp-integration.md', 'media-upload.md'];
const BASE_FILES = ['package.json', 'README.md', 'LICENSE', 'assets/logo.svg',
  'runtime/index.ts', 'runtime/registration.json'];
export const PAYLOAD_FILES = [...BASE_FILES, ...SKILLS.flatMap(skill =>
  ['skills/' + skill + '/SKILL.md', ...REFERENCES.map(name => 'skills/' + skill + '/references/' + name)])].sort();
export const archiveName = version => 'fotor-ai-opencode-fotor-plugin-' + version + '.tgz';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const canonical = value => JSON.stringify(sorted(value));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  }
  return value;
}
export function safePath(name) {
  assert(name && !name.includes('\\') && !name.includes(':') && !/[\x00-\x1f\x7f]/.test(name),
    'Unsafe archive path');
  assert(name.split('/').every(part => part && part !== '.' && part !== '..'),
    'Unsafe archive path');
  return name;
}
export function tree(root) {
  const result = [];
  function visit(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + entry.name;
      const full = path.join(dir, entry.name);
      const stat = fs.lstatSync(full);
      assert(!stat.isSymbolicLink(), 'Unexpected symbolic link: ' + relative);
      if (stat.isDirectory()) visit(full, relative + '/');
      else {
        assert(stat.isFile(), 'Unexpected special file: ' + relative);
        result.push({ path: safePath(relative), sha256: sha256(fs.readFileSync(full)), mode: stat.mode & 0o7777 });
      }
    }
  }
  visit(root, '');
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
// Read the actual npm tarball, including PAX paths. No archive is extracted.
export function tarFiles(archive) {
  const bytes = gunzipSync(archive);
  const result = new Map();
  let offset = 0;
  let extended = {};
  const text = (header, start, length) =>
    header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    offset += 512;
    if (header.every(byte => byte === 0)) break;
    const expected = parseInt(text(header, 148, 8).trim(), 8);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    assert.equal(checksum, expected, 'Invalid tar checksum');
    const size = parseInt(text(header, 124, 12).trim() || '0', 8);
    assert(Number.isSafeInteger(size) && size >= 0 && offset + size <= bytes.length, 'Invalid tar size');
    const data = bytes.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const type = text(header, 156, 1);
    if (type === 'x') {
      extended = {};
      let position = 0;
      while (position < data.length) {
        const space = data.indexOf(32, position);
        const length = Number(data.subarray(position, space).toString());
        assert(space > position && Number.isSafeInteger(length) && length > 0 && position + length <= data.length, 'Invalid PAX record');
        const record = data.subarray(space + 1, position + length - 1).toString();
        const equal = record.indexOf('=');
        assert(equal > 0);
        extended[record.slice(0, equal)] = record.slice(equal + 1);
        position += length;
      }
      continue;
    }
    assert(type === '' || type === '0' || type === '5', 'Archive links and special entries are forbidden');
    const prefix = text(header, 345, 155);
    let name = extended.path || (prefix ? prefix + '/' : '') + text(header, 0, 100);
    extended = {};
    name = name.replace(/\/$/, '');
    safePath(name);
    if (type === '5') continue;
    assert(name.startsWith('package/'), 'Unexpected archive root');
    name = name.slice('package/'.length);
    assert(!result.has(name), 'Duplicate archive member: ' + name);
    const mode = parseInt(text(header, 100, 8).trim(), 8);
    assert((mode & ~0o777) === 0, 'Special permission bits in archive');
    result.set(name, { data, mode, sha256: sha256(data) });
  }
  assert(Object.keys(extended).length === 0, 'Unterminated PAX header');
  return result;
}

export function validateManifest(manifest, { npm = false } = {}) {
  const expected = {
    name: NAME, version: manifest.version,
    description: 'Connect to the Fotor MCP service to create images, video and audio.',
    author: { name: 'Fotor' }, homepage: 'https://www.fotor.com', repository: REPOSITORY,
    license: 'Apache-2.0', type: 'module',
    exports: { '.': './runtime/index.ts', './server': './runtime/index.ts' },
    files: ['runtime', 'skills', 'assets', 'README.md', 'LICENSE'],
    peerDependencies: { '@opencode/plugin': SDK_RANGE },
    peerDependenciesMeta: { '@opencode/plugin': { optional: true } },
    ...(npm ? { publishConfig: { access: 'public' } } : { private: true }),
  };
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-test\.[1-9]\d*)?$/);
  assert.deepEqual(manifest, expected, 'Unexpected OpenCode manifest or dependency contract');
}

export function validatePayload(files, { npm = false } = {}) {
  assert.deepEqual([...files.keys()].sort(), PAYLOAD_FILES, 'Unexpected or missing package file');
  for (const [name, item] of files) {
    assert.equal(item.mode, 0o644, 'Unexpected payload mode: ' + name);
    assert(!item.data.subarray(0, 5).toString().replace(/^\uFEFF/, '').startsWith('#!'), 'Embedded executable');
  }
  const manifest = JSON.parse(files.get('package.json').data.toString());
  validateManifest(manifest, { npm });
  const registration = JSON.parse(files.get('runtime/registration.json').data.toString());
  assert.deepEqual(Object.keys(registration).sort(), ['plugin_id', 'schema_version', 'server', 'server_name', 'skills']);
  assert.equal(registration.schema_version, 1);
  assert.equal(registration.plugin_id, 'fotor');
  assert.equal(registration.server_name, 'fotor');
  assert.deepEqual(registration.server, { type: 'remote', url: 'https://mcp.fotor.com/mcp', codemode: false });
  assert.deepEqual(registration.skills.map(skill => skill.id).sort(), SKILLS);
  for (const skill of registration.skills) {
    assert.deepEqual(Object.keys(skill).sort(), ['content', 'description', 'id', 'name', 'path', 'sha256']);
    assert.equal(skill.path, 'skills/' + skill.id + '/SKILL.md');
    assert.equal(skill.name, skill.id);
    assert(typeof skill.description === 'string' && skill.description.trim());
    const data = files.get(skill.path).data;
    assert.equal(skill.sha256, sha256(data), 'Registration hash differs from skill');
    const text = data.toString();
    assert(text.startsWith('---\n') && text.indexOf('\n---\n', 4) > 4, 'Invalid skill frontmatter');
    assert.equal(skill.content, text.slice(text.indexOf('\n---\n', 4) + 5), 'Registration body differs from skill');
    const auth = files.get('skills/' + skill.id + '/references/authentication.md').data.toString();
    assert.match(auth, /^---\nplatform: opencode\n---/);
  }
  assert.match(files.get('LICENSE').data.toString(), /Apache License/);
  return manifest;
}

export function validateInput(input) {
  const files = tree(input);
  assert.deepEqual(files.map(item => item.path).sort(), [...PAYLOAD_FILES, ...RELEASE_FILES].sort(),
    'Unexpected or missing standalone distribution file');
  for (const item of files) assert.equal(item.mode, 0o644, 'Unexpected source mode: ' + item.path);
  const payload = new Map(files.filter(item => !RELEASE_FILES.includes(item.path))
    .map(item => [item.path, { ...item, data: fs.readFileSync(path.join(input, item.path)) }]));
  return { files, payload, manifest: validatePayload(payload) };
}

export function stagedManifest(manifest) {
  validateManifest(manifest);
  const result = { ...manifest, publishConfig: { access: 'public' } };
  delete result.private;
  return result;
}

export function assertOrdinaryPath(filename) {
  for (let current = path.resolve(filename);; current = path.dirname(current)) {
    try { assert(!fs.lstatSync(current).isSymbolicLink(), 'Path contains a symbolic link'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
}

export function makeReport(files, archive, source, manifest) {
  assert.match(source, /^[a-f0-9]{40}$/, 'Expected fixed source commit');
  return {
    format_version: 1, artifact_type: 'opencode-npm', source_commit: source,
    channel: manifest.version.includes('-test.') ? 'test' : 'production',
    package: NAME, version: manifest.version, sha256: sha256(archive),
    integrity: 'sha512-' + createHash('sha512').update(archive).digest('base64'),
    peer_dependencies: { '@opencode/plugin': SDK_RANGE }, host_provided_peers: ['@opencode/plugin'],
    bundled_dependencies: [], manifest_changes: ['remove private', 'set publishConfig.access=public'],
    files: [...files].map(([name, item]) => ({ path: name, mode: '0644', sha256: sha256(item.data) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  };
}

export async function build({ input, output, report, source, npm = 'npm' }) {
  assert.equal(process.versions.node, NODE_VERSION, 'Unexpected build Node version');
  assert.match(source, /^[a-f0-9]{40}$/, 'Expected fixed source commit');
  for (const name of [input, output, report]) assertOrdinaryPath(name);
  input = fs.realpathSync(input); output = path.resolve(output); report = path.resolve(report);
  const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
  assert(!inside(output, input) && !inside(input, output) && !inside(report, input)
    && !inside(report, output) && !inside(output, report), 'Input, output and report must be separate');
  assert(!fs.existsSync(output) && !fs.existsSync(report), 'Output/report must be new');
  const checked = validateInput(input);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fotor-opencode-npm-'));
  let createdOutput = false, createdReport = false;
  try {
    const stage = path.join(temporary, 'stage');
    fs.mkdirSync(stage);
    for (const [name, item] of checked.payload) {
      const destination = path.join(stage, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, item.data, { flag: 'wx', mode: 0o644 });
    }
    const manifest = stagedManifest(checked.manifest);
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(stage, 'package.json'), bytes);
    const expected = new Map(checked.payload);
    expected.set('package.json', { data: bytes, mode: 0o644, sha256: sha256(bytes) });
    const config = path.join(temporary, 'npmrc'), globalConfig = path.join(temporary, 'global-npmrc');
    fs.writeFileSync(config, ''); fs.writeFileSync(globalConfig, '');
    const env = Object.fromEntries(['PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    Object.assign(env, { NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: globalConfig,
      NPM_CONFIG_CACHE: path.join(temporary, 'cache'), NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_OFFLINE: 'true' });
    const run = args => {
      const result = spawnSync(npm, args, { cwd: stage, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
      assert(!result.error && result.status === 0, 'npm pack command failed: ' + (result.error?.message || result.stderr));
      return result.stdout.trim();
    };
    assert.equal(run(['--version']), NPM_VERSION, 'Unexpected build npm version');
    const packed = path.join(temporary, 'packed'); fs.mkdirSync(packed);
    run(['pack', '--ignore-scripts', '--json', '--pack-destination', packed]);
    const name = archiveName(manifest.version);
    assert.deepEqual(fs.readdirSync(packed), [name], 'Expected exactly one npm archive');
    const archive = fs.readFileSync(path.join(packed, name));
    const actual = tarFiles(archive);
    validatePayload(actual, { npm: true });
    for (const [filename, item] of expected) assert(actual.get(filename).data.equals(item.data), 'Packed file changed: ' + filename);
    assert.deepEqual(tree(input), checked.files, 'Input changed while packing');
    const result = makeReport(actual, archive, source, manifest);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(path.dirname(report), { recursive: true });
    assertOrdinaryPath(output); assertOrdinaryPath(report);
    fs.mkdirSync(output); createdOutput = true;
    fs.writeFileSync(path.join(output, name), archive, { flag: 'wx', mode: 0o644 });
    fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o644 }); createdReport = true;
    return result;
  } catch (error) {
    if (createdReport) fs.rmSync(report);
    if (createdOutput) fs.rmSync(output, { recursive: true, force: true });
    throw error;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  assert(args.length % 2 === 0, 'Expected --input/--output/--report/--source values');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    assert(['input', 'output', 'report', 'source'].includes(key) && !Object.hasOwn(options, key), 'Unexpected option');
    options[key] = args[i + 1];
  }
  assert(['input', 'output', 'report', 'source'].every(key => options[key]), 'Missing build option');
  build(options).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
