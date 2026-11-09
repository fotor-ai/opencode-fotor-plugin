# Fotor for OpenCode Desktop / CLI

<p align="center"><img src="assets/logo.svg" width="72" alt="Fotor logo" /></p>

<p align="center">
  <img src="https://img.shields.io/static/v1?label=version&amp;message=0.9.0&amp;color=087f8c&amp;style=flat-square" alt="Version" />
  <img src="https://img.shields.io/static/v1?label=channel&amp;message=production&amp;color=238636&amp;style=flat-square" alt="Release channel" />
  <a href="LICENSE"><img src="https://img.shields.io/static/v1?label=license&amp;message=Apache-2.0&amp;color=57606a&amp;style=flat-square" alt="Apache-2.0 license" /></a>
</p>

Create images, video and audio with Fotor in OpenCode Desktop and CLI through
native HTTP MCP and OAuth. This complete root package is independently
distributed from [fotor-ai/opencode-fotor-plugin](https://github.com/fotor-ai/opencode-fotor-plugin) and npm. Verify that
the selected channel has actually been published before using its installation
command.

| Field | Value |
| --- | --- |
| Plugin | `fotor` |
| Package | `@fotor-ai/opencode-fotor-plugin` |
| Version | `0.9.0` |
| Release channel | `production` |
| Service environment | `production` |
| MCP endpoint | `https://mcp.fotor.com/mcp` |
| Client baselines | OpenCode v2 CLI and Desktop 2.2.5 |
| License | [Apache-2.0](LICENSE) |

## Features and verification

The six skills cover connection/model queries, images, video, audio, uploads and
your own Fotor credit balance. A small native server module registers the skills
and Fotor MCP; OpenCode manages authorization, connections and permissions.
Complete tool discovery respects user restrictions. Skills and their references
remain script-free.

New Fotor services use direct tools and keep the host's execution timeout.
Matching user configuration keeps its settings; conflicting sources stop
activation. No bridge, GUI/TUI extension or installation hook is required.

Package checks cover files, references and configuration. Verify installation,
authorization and calls, website access and media execution separately for the
actual host and installed source. The tested 2.2.5 client baselines cover basic
operations; real media generation has not been verified. See the
[versioned host limitations](skills/fotor-connect/references/authentication.md#versioned-host-limitations).

<a id="opencode"></a>

## OpenCode Desktop / CLI

### Installation and source

#### Production release

Use these commands only after the selected npm/Git channel has been published and verified. Choose one source, preserving your existing configuration.

```bash
opencode plugin add @fotor-ai/opencode-fotor-plugin
# Alternative Git source:
opencode plugin add 'git+https://github.com/fotor-ai/opencode-fotor-plugin.git'
```

The npm target follows its registry tag; the Git target follows the selected branch, not the latest GitHub Release. Verify the actual installed version and source.

Record the source returned by `opencode plugin list`. Reload the selected server
and start a new session. If another Fotor source is already installed, use native
management to remove only that recorded source before adding the alternative;
preserve account authorization, user settings and other plugins. This is a source
switch, not an upgrade. Do not install both Fotor sources together.

Desktop uses its selected server's plugin configuration. Its GUI-extension switch
does not disable this server-only plugin. Use native plugin configuration to
disable the complete plugin; inspect MCP connection status separately.

### Skills and connection

Verify version **0.9.0**, current skill paths and one `fotor` service.
Explicit skill selection uses `@fotor-connect`; model invocation uses the native
`skill` tool's `id`. Read the selected skill's own reference files.

Reuse usable grants. If native status confirms consent is needed, use `/mcps`,
Desktop MCP controls or `opencode mcp auth fotor`. OAuth opens an ordinary
external browser. Follow the [authentication reference](skills/fotor-connect/references/authentication.md)
and shared completion choice; browser success alone does not prove connection.

### Website and balance

Prepare the daily external browser for CLI, or the session-attached native
browser for Desktop, before asking for a one-time handoff. Open the original URL
once and obtain the user's page result. Preserve existing cookies and stop if
the selected browser route is unavailable. MCP connection does not itself open
the website. The balance skill only reports your own Fotor credit balance.

### Update and remove

For a published source, use `opencode plugin check <recorded-source>`,
`opencode plugin update <recorded-source>` and `opencode plugin remove <recorded-source>`.
Keep the same mutable npm tag or Git branch for a native update. Do not uninstall
first, delete its cache or substitute a fresh install when update fails. A repeat
update should retain the same package files; inspect the resulting native state.
Exact npm versions and complete Git commits are pinned. Change a pinned target
intentionally; retain one source rather than adding duplicates. Git branches
and tags follow their Git references, not the latest GitHub Release.

Local source replacement, shared configuration and real public-source upgrade
are separate acceptance claims. Preserve native account settings and grants.
After replacement or full server restart, check actual content and a read-only
operation in a new session. Plugin removal is not authorization revocation.

For local development, retain the complete package outside temporary worktrees
and configure its absolute path in the native `plugins` list. A local directory
is configured directly; `plugin add` accepts npm/Git package targets. Keep the
local source and rollback information when switching to a public channel.


## Workflows

Audio workflows cover soundtrack composition, new tracks, song editing, speech,
podcasts and vocal separation. Consult the installed audio skill for the matching
request.

Read [MCP workflows](skills/fotor-connect/references/mcp-integration.md#runtime-workflow),
[media preparation](skills/fotor-connect/references/media-upload.md) and
[your own Fotor credit balance](skills/fotor-connect/references/credits.md)
for the matching request. Every skill carries its own four runtime references;
no repository or sibling skill is needed to read them.

## Contents and license

- `package.json`: the native server plugin manifest and host SDK peer declaration.
- `runtime/`: the reviewed server entry and generated skill registration.
- `skills/`: six skills, each with four local reference documents.
- `assets/logo.svg`, `README.md` and [LICENSE](LICENSE): package-local branding,
  documentation and Apache-2.0 license.
- Git snapshots additionally contain `.github/` publication tooling, excluded from
  the npm tarball and plugin runtime.

The multi-platform repository documents this external source rather than
carrying another installable OpenCode copy.
