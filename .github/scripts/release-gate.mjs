// OpenCode publication controls; never installed or invoked by the plugin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NAME, REPOSITORY, tarFiles, sha256, archiveName, validatePayload, stagedManifest, makeReport, assertOrdinaryPath } from './pack-npm.mjs';

const repo = 'fotor-ai/opencode-fotor-plugin';
const registry = 'https://registry.npmjs.org/';
const WAIT_MS = 600_000;
const POLL_MS = 15_000;
const REQUEST_MS = 30_000;
const versionPattern = /^\d+\.\d+\.\d+(?:-test\.[1-9]\d*)?$/;
// The reviewed npm bootstrap archive from 2026-11-05, not a publishable plugin.
// Accept only these bytes; another placeholder requires a new release decision.
const bootstrapPlaceholder = Object.freeze({
  version: '0.0.0-stage',
  integrity: 'sha512-JnVyxuwC3pDTSvg0/oG23d9gFfkTTQQ4dGUDkFoME1bvnsOnmHufaSV/Hr6j4T2bD3FvkUj8G6vb3XMTbv7oXg==',
  sha256: '5a8080a0b9daee361c6d1d9c68dc8046f8885cc57cb4c23142395253cf35a357',
});

class Processing extends Error {
  constructor(message, retryAfter = 0) { super(message); this.retryAfter = retryAfter; }
}
export class PublicationPending extends Error {
  constructor(reason, commandExitCode) {
    super('Publication remains unconfirmed after the read-only deadline: ' + reason);
    this.result = { status: 'pending', reason, publish_exit_code: commandExitCode, retry_publish: false };
  }
}
function runtime(dependencies = {}) {
  return { now: () => performance.now(), wallNow: Date.now,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), fetch: globalThis.fetch,
    timeoutSignal: ms => AbortSignal.timeout(Math.max(1, Math.ceil(ms))),
    log: value => console.error(JSON.stringify(value)), ...dependencies };
}
function remaining(rt, deadline) {
  const value = deadline - rt.now();
  if (value <= 0) throw new Processing('verification deadline reached');
  return value;
}
function registryURL(value) {
  const url = new URL(value);
  assert.equal(url.origin, registry.slice(0, -1), 'Unexpected registry origin');
  assert(!url.username && !url.password && !url.hash, 'Unexpected registry URL credentials or fragment');
  return url.href;
}
function retryAfter(response, rt) {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - rt.wallNow()) : 0;
}
async function readRegistry(url, rt, deadline, { absentAllowed = false, bytes = false } = {}) {
  const timeout = Math.min(REQUEST_MS, remaining(rt, deadline));
  try {
    const response = await rt.fetch(registryURL(url), { method: 'GET', redirect: 'error',
      headers: { 'Cache-Control': 'no-cache', Accept: bytes ? 'application/octet-stream' : 'application/json' },
      signal: rt.timeoutSignal(timeout) });
    if (response.status === 404) {
      if (absentAllowed) return undefined;
      throw new Processing('registry resource not yet available');
    }
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      throw new Processing('temporary registry HTTP ' + response.status, retryAfter(response, rt));
    }
    assert(response.ok, 'Registry check failed: ' + response.status);
    const result = bytes ? Buffer.from(await response.arrayBuffer()) : await response.json();
    remaining(rt, deadline);
    return result;
  } catch (error) {
    if (error instanceof Processing) throw error;
    const transient = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED',
      'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'];
    if (['AbortError', 'TimeoutError'].includes(error.name) || transient.includes(error.cause?.code || error.code)) {
      throw new Processing('temporary registry transport failure');
    }
    throw error;
  }
}
export function validateStableRelease({ version, sha, tagType, tagCommit, release }) {
  assert.equal(tagType, 'tag', 'Expected an annotated release Tag');
  assert.equal(tagCommit, sha, 'Tag and publication commit differ');
  assert(!release.draft && !release.prerelease && release.tag_name === 'v' + version,
    'Expected matching published stable GitHub Release');
}
export function assertVersionAvailable(metadata, version) {
  assert(!metadata?.versions?.[version], 'npm version already exists; inspect registry instead of overwriting');
}
export function validateSelection({ version, channel, ref, repository, sha }) {
  assert.equal(repository, repo, 'Wrong publication repository');
  assert.match(sha, /^[a-f0-9]{40}$/, 'Expected full source commit');
  if (channel === 'next') {
    assert.equal(ref, 'refs/heads/release/test', 'next requires release/test');
    assert.match(version, /^\d+\.\d+\.\d+-test\.[1-9]\d*$/);
  } else {
    assert.equal(channel, 'latest', 'Unknown npm channel');
    assert.equal(ref, 'refs/heads/main', 'latest requires main');
    assert.match(version, /^\d+\.\d+\.\d+$/);
  }
}
function command(name, args, rt, deadline) {
  const result = spawnSync(name, args, { encoding: 'utf8', timeout: Math.ceil(Math.min(REQUEST_MS, remaining(rt, deadline))) });
  if (result.error?.code === 'ETIMEDOUT') throw new Processing(name + ' verification timed out');
  assert(!result.error && result.status === 0, name + ' publication check failed');
  return result.stdout.trim();
}
export function verifyArtifact(directory, version) {
  assertOrdinaryPath(directory);
  const reportPath = path.join(directory, 'npm-report.json');
  const name = archiveName(version);
  assert.deepEqual(fs.readdirSync(directory).sort(), [name, 'npm-report.json'].sort());
  for (const filename of [reportPath, path.join(directory, name)]) {
    assertOrdinaryPath(filename);
    assert(fs.lstatSync(filename).isFile(), 'Expected regular artifact file');
  }
  const report = JSON.parse(fs.readFileSync(reportPath));
  const archive = fs.readFileSync(path.join(directory, name));
  const files = tarFiles(archive);
  const manifest = validatePayload(files, { npm: true });
  assert.equal(manifest.version, version);
  assert.deepEqual(report, makeReport(files, archive, report.source_commit, manifest), 'Artifact report differs from tarball');
  return report;
}
export function verifyProvenance(document, { integrity, sha, ref }) {
  const digest = Buffer.from(integrity.split('-', 2)[1], 'base64').toString('hex');
  const statements = (document.attestations || []).filter(item =>
    item.predicateType === 'https://slsa.dev/provenance/v1').map(item =>
    JSON.parse(Buffer.from(item.bundle.dsseEnvelope.payload, 'base64').toString()));
  assert(statements.some(statement => {
    const definition = statement.predicate?.buildDefinition;
    const workflow = definition?.externalParameters?.workflow;
    return statement.subject?.some(subject => subject.digest?.sha512 === digest)
      && workflow?.repository === REPOSITORY && workflow?.ref === ref
      && workflow?.path === '.github/workflows/publish-npm.yml'
      && definition?.resolvedDependencies?.some(dependency =>
        dependency.digest?.gitCommit === sha && dependency.uri?.startsWith('git+' + REPOSITORY + '@'));
  }), 'Published provenance does not match source and artifact');
}
function stateLocation(filename, directory) {
  assert(filename && directory, 'Artifact directory and publication state are required');
  const resolved = path.resolve(filename);
  const inside = parent => resolved === parent || resolved.startsWith(parent + path.sep);
  assert(!inside(path.resolve(directory)) && !inside(process.cwd()), 'State must be outside source and artifact directories');
  for (let current = resolved;; current = path.dirname(current)) {
    try { assert(!fs.lstatSync(current).isSymbolicLink(), 'Publication state path contains a symbolic link'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  return resolved;
}
function stateBinding(selection, report, directory, environment) {
  assert.match(environment.GITHUB_RUN_ID || '', /^\d+$/, 'Expected the originating workflow run ID');
  return { format_version: 1, selection, run_id: environment.GITHUB_RUN_ID,
    source_commit: report.source_commit, artifact_sha256: report.sha256, integrity: report.integrity,
    report_sha256: sha256(fs.readFileSync(path.join(directory, 'npm-report.json'))) };
}
function loadState(filename, binding, environment) {
  assert(fs.existsSync(filename) && fs.lstatSync(filename).isFile(), 'Publication state is missing');
  const bytes = fs.readFileSync(filename);
  assert.match(environment.FOTOR_PUBLICATION_STATE_SHA256 || '', /^[a-f0-9]{64}$/, 'Missing trusted state digest');
  assert.equal(sha256(bytes), environment.FOTOR_PUBLICATION_STATE_SHA256, 'Publication state digest mismatch');
  const state = JSON.parse(bytes);
  assert.deepEqual(Object.keys(state).sort(), [...Object.keys(binding), 'latest_before', 'channel_before', 'next_before'].sort(), 'Unexpected state fields');
  for (const [key, value] of Object.entries(binding)) assert.deepEqual(state[key], value, 'Publication state binding mismatch: ' + key);
  for (const key of ['latest_before', 'channel_before', 'next_before']) {
    assert(state[key] === null || (typeof state[key] === 'string' && versionPattern.test(state[key])), 'Invalid channel baseline');
  }
  return state;
}
function approvedLatest(expected) {
  assert(expected === 'absent' || (typeof expected === 'string' && versionPattern.test(expected)),
    'An explicit OpenCode latest baseline is required');
  return expected === 'absent' ? null : expected;
}
function checkLatest(metadata, selection, expected) {
  if (selection.channel !== 'next') return;
  assert.equal(metadata?.['dist-tags']?.latest ?? null, expected, 'latest changed from its approved baseline');
}
async function checkPackageIdentity(metadata, rt, deadline) {
  if (!metadata) return;
  assert(metadata.name === undefined || metadata.name === NAME, 'Wrong registry package');
  for (const [version, value] of Object.entries(metadata.versions || {})) {
    if (version !== bootstrapPlaceholder.version) {
      assert.match(version, versionPattern, 'Unexpected registry version; obtain a release decision');
      continue;
    }
    assert(value?.name === NAME && value.version === version, 'Unexpected bootstrap placeholder identity');
    assert.equal(value.dist?.integrity, bootstrapPlaceholder.integrity, 'Bootstrap placeholder integrity changed');
    assert.equal(typeof value.dist?.tarball, 'string', 'Bootstrap placeholder tarball is missing');
    const archive = await readRegistry(value.dist.tarball, rt, deadline, { bytes: true });
    assert.equal(sha256(archive), bootstrapPlaceholder.sha256, 'Bootstrap placeholder archive changed');
    assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'),
      bootstrapPlaceholder.integrity, 'Bootstrap placeholder archive integrity changed');
  }
}
function checkSource(selection, run) {
  assert.equal(run('git', ['rev-parse', 'HEAD']), selection.sha);
  run('git', ['diff', '--exit-code', 'HEAD', '--']);
  assert.equal(run('git', ['status', '--porcelain', '--untracked-files=all']), '', 'Publication source is not clean');
  const branch = selection.channel === 'next' ? 'release/test' : 'main';
  const current = JSON.parse(run('gh', ['api', 'repos/' + repo + '/commits/' + branch]));
  assert.equal(current.sha, selection.sha, 'Branch changed since workflow dispatch');
}
async function observedPublication({ selection, report, state, rt, deadline, provenance }) {
  const metadata = await readRegistry(registry + encodeURIComponent(NAME), rt, deadline, { absentAllowed: true });
  if (!metadata) throw new Processing('package is not yet publicly visible');
  await checkPackageIdentity(metadata, rt, deadline);
  checkLatest(metadata, selection, state.latest_before);
  if (selection.channel === 'latest') assert.equal(metadata['dist-tags']?.next ?? null, state.next_before, 'next changed during stable publication');
  const tag = metadata['dist-tags']?.[selection.channel];
  assert(tag === undefined || tag === state.channel_before || tag === selection.version, 'Publication channel moved to an unexpected version');
  const published = metadata.versions?.[selection.version];
  if (!published) throw new Processing('target version is not yet publicly visible');
  if (published.name !== undefined) assert.equal(published.name, NAME, 'Published package name mismatch');
  if (published.version !== undefined) assert.equal(published.version, selection.version, 'Published version mismatch');
  if (!published.dist?.integrity) throw new Processing('published integrity is not yet available');
  assert.equal(published.dist.integrity, report.integrity, 'Published integrity mismatch');
  if (!published.dist.tarball) throw new Processing('published tarball is not yet available');
  const archive = await readRegistry(published.dist.tarball, rt, deadline, { bytes: true });
  assert.equal(sha256(archive), report.sha256, 'Published tarball SHA-256 mismatch');
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), report.integrity, 'Published tarball integrity mismatch');
  if (provenance) {
  const attestation = published.dist.attestations?.url;
  if (!attestation) throw new Processing('provenance is not yet available');
  const document = await readRegistry(attestation, rt, deadline);
  assert(Array.isArray(document.attestations), 'Invalid provenance response');
  if (!document.attestations.some(item => item.predicateType === 'https://slsa.dev/provenance/v1')) {
    throw new Processing('provenance statement is not yet available');
  }
  verifyProvenance(document, { integrity: report.integrity, sha: selection.sha, ref: selection.ref });
  }
  if (tag !== selection.version) throw new Processing('publication channel has not caught up');
}
export async function gate({ phase, version, channel, directory, state: stateFilename,
  environment = process.env, dependencies = {} }) {
  assert(['preflight', 'published', 'manual-published'].includes(phase));
  const mode = environment.MODE;
  assert(['build-only', 'publish'].includes(mode), 'Expected build-only or publish mode');
  if (phase !== 'preflight') {
    assert(directory && stateFilename, 'Published verification requires artifact and state');
    assert.equal(mode, phase === 'published' ? 'publish' : 'build-only', 'Verification mode mismatch');
  }
  const rt = runtime(dependencies), deadline = rt.now() + WAIT_MS;
  const run = (name, args) => command(name, args, rt, deadline);
  const selection = { version, channel, ref: environment.GITHUB_REF,
    repository: environment.GITHUB_REPOSITORY, sha: environment.GITHUB_SHA, mode };
  validateSelection(selection);
  if (phase === 'preflight' && mode === 'publish') {
    assert.equal(environment.GITHUB_RUN_ATTEMPT, '1', 'Do not rerun publication jobs; use read-only published verification');
  }
  checkSource(selection, run);
  let report;
  if (directory) {
    report = verifyArtifact(directory, version);
    assert.equal(report.source_commit, selection.sha, 'Artifact source commit differs');
    const archive = tarFiles(fs.readFileSync(path.join(directory, archiveName(version))));
    for (const [name, item] of archive) {
      const bytes = name === 'package.json'
        ? Buffer.from(JSON.stringify(stagedManifest(JSON.parse(fs.readFileSync(name))), null, 2) + '\n')
        : fs.readFileSync(name);
      assert(item.data.equals(bytes), 'Packed payload differs from committed source: ' + name);
      assert.equal(fs.lstatSync(name).mode & 0o7777, 0o644, 'Unexpected committed payload mode');
    }
  }
  if (channel === 'latest') {
    const release = JSON.parse(run('gh', ['api', 'repos/' + repo + '/releases/tags/v' + version]));
    validateStableRelease({ version, sha: selection.sha, release,
      tagType: run('git', ['cat-file', '-t', 'refs/tags/v' + version]),
      tagCommit: run('git', ['rev-parse', 'refs/tags/v' + version + '^{commit}']) });
  }
  const manifest = JSON.parse(fs.readFileSync('package.json'));
  assert.equal(manifest.name, NAME); assert.equal(manifest.version, version);
  if (phase === 'preflight') {
    const metadata = await readRegistry(registry + encodeURIComponent(NAME), rt, deadline, { absentAllowed: true });
    await checkPackageIdentity(metadata, rt, deadline);
    assertVersionAvailable(metadata, version);
    assert.equal(metadata?.['dist-tags']?.latest ?? null, approvedLatest(environment.EXPECTED_LATEST),
      'latest changed from its approved baseline');
    if (mode === 'publish') assert(metadata, 'Initialize the npm package before OIDC publication');
    if (!metadata) assert(channel === 'next' && /-test\.1$/.test(version), 'Only first test build may precede package initialization');
    if (!stateFilename) {
      assert(!directory, 'An artifact preflight requires publication state');
      return { status: 'preflight', source: selection.sha, version, channel, absent: true };
    }
    const filename = stateLocation(stateFilename, directory);
    const binding = stateBinding(selection, report, directory, environment);
    let state;
    if (fs.existsSync(filename)) {
      state = loadState(filename, binding, environment);
      assert.equal(metadata?.['dist-tags']?.latest ?? null, state.latest_before, 'latest changed after build approval baseline');
      assert.equal(metadata?.['dist-tags']?.[channel] ?? null, state.channel_before, 'Publication channel changed after build');
      assert.equal(metadata?.['dist-tags']?.next ?? null, state.next_before, 'next changed after build');
    } else {
      assert(!environment.FOTOR_PUBLICATION_STATE_SHA256, 'Expected state was removed');
      state = { ...binding, latest_before: metadata?.['dist-tags']?.latest ?? null,
        channel_before: metadata?.['dist-tags']?.[channel] ?? null,
        next_before: metadata?.['dist-tags']?.next ?? null };
      fs.writeFileSync(filename, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    return { status: 'ready', source: selection.sha, version, channel, absent: true,
      state_sha256: sha256(fs.readFileSync(filename)), latest_before: state.latest_before };
  }
  const filename = stateLocation(stateFilename, directory);
  const binding = stateBinding(selection, report, directory, environment);
  const state = loadState(filename, binding, environment);
  if (channel === 'next') assert.equal(state.latest_before, approvedLatest(environment.EXPECTED_LATEST), 'Approved latest and state differ');
  const exitText = environment.FOTOR_PUBLISH_EXIT_CODE;
  assert(exitText === undefined || /^\d{1,3}$/.test(exitText), 'Invalid publication exit status');
  const exitCode = exitText === undefined ? null : Number(exitText);
  const errorCode = environment.FOTOR_PUBLISH_ERROR_CODE || '';
  assert(/^(?:|E401|E403|EOTP|ENEEDAUTH)$/.test(errorCode), 'Invalid publication error classification');
  const authenticationFailure = Boolean(errorCode);
  let lastReason = 'registry verification not completed';
  for (;;) {
    try {
      checkSource(selection, run);
      await observedPublication({ selection, report, state, rt, deadline, provenance: phase === 'published' });
      checkSource(selection, run); remaining(rt, deadline);
      const result = { status: 'verified', source: selection.sha, version, channel,
        integrity: report.integrity, provenance: phase === 'published', latest_before: state.latest_before,
        publish_exit_code: exitCode, retry_publish: false };
      rt.log(result);
      assert(!authenticationFailure && (exitCode === null || exitCode === 0),
        'Registry verified, but original publication command failed; preserve and investigate the original result');
      return result;
    } catch (error) {
      if (!(error instanceof Processing)) throw error;
      lastReason = error.message;
      if (authenticationFailure) throw new Error('Publication authentication failed (' + errorCode + '); registry remains unconfirmed');
      const left = deadline - rt.now();
      if (left <= 0) throw new PublicationPending(lastReason, exitCode);
      rt.log({ status: 'processing', reason: lastReason, remaining_ms: Math.ceil(left), publish_exit_code: exitCode, retry_publish: false });
      await rt.sleep(Math.min(left, Math.max(POLL_MS, error.retryAfter)));
      if (rt.now() >= deadline) throw new PublicationPending(lastReason, exitCode);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [phase, version, channel, ...rest] = process.argv.slice(2);
  const directory = rest[0] !== '--state' ? rest.shift() : undefined;
  const state = rest.length === 2 && rest[0] === '--state' ? rest[1] : undefined;
  assert(rest.length === 0 || state, 'Expected optional artifact directory and --state PATH');
  gate({ phase, version, channel, directory, state }).then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error(JSON.stringify(error.result || { status: 'failed', reason: error.message, retry_publish: false }));
      process.exitCode = error instanceof PublicationPending ? 2 : 1;
    });
}
