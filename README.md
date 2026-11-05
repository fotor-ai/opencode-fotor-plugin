# Fotor for OpenCode Desktop / CLI

<p align="center"><img src="assets/logo.svg" width="72" alt="Fotor logo" /></p>

Version **0.9.0-test.1**, channel **test**. This package supports OpenCode
v2. CLI and Desktop acceptance targets 2.2.5; other versions need their own
verification. The independent distribution repository is
[fotor-ai/opencode-fotor-plugin](https://github.com/fotor-ai/opencode-fotor-plugin), and the npm identity is
`@fotor-ai/opencode-fotor-plugin`. Verify that the selected channel contains this
version before installation; a generated snapshot alone does not publish it.

## Capabilities and verification

Six shared skills cover connection/model queries, images, video, audio, uploads
and your own Fotor credit balance. A small reviewed server module registers
them and the production MCP endpoint `https://mcp.fotor.com/mcp`. OpenCode owns native HTTP,
OAuth, tool discovery and permissions. Skill files and their references contain
no scripts. No bridge, GUI/TUI extension or installation hook is required.

New services expose direct tools without changing host execution timeouts.
Matching user configuration remains authoritative; conflicting sources stop
activation. Native installation, authorization, website access and media
execution need separate evidence. See the
[versioned host limitations](skills/fotor-connect/references/authentication.md#versioned-host-limitations).

<a id="opencode"></a>

## OpenCode Desktop / CLI

### Installation and source

#### Test release

Use these commands only after the selected npm/Git channel has been published and verified. Choose one source, preserving your existing configuration.

```bash
opencode plugin add @fotor-ai/opencode-fotor-plugin@next
# Alternative Git source:
opencode plugin add 'git+https://github.com/fotor-ai/opencode-fotor-plugin.git#release/test'
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

Verify version **0.9.0-test.1**, current skill paths and one `fotor` service.
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


## Workflows and contents

Read the [MCP workflow](skills/fotor-connect/references/mcp-integration.md#runtime-workflow),
[media preparation](skills/fotor-connect/references/media-upload.md) and
[balance reference](skills/fotor-connect/references/credits.md) for your request.
Every skill carries its own four runtime references.

The complete root package contains `package.json`, the reviewed `runtime/`,
`skills/`, `assets/logo.svg`, this README and [LICENSE](LICENSE). The collection
repository carries an external navigation entry, not another OpenCode package.
Repository-only `.github/` files maintain publication and are excluded from the
npm tarball. They are not installation hooks or plugin runtime entrypoints.
