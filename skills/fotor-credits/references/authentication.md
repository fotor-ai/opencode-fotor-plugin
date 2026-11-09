---
platform: opencode
---

# OpenCode v2 authentication and browser routes

## Native plugin and skills

OpenCode CLI and Desktop share this Fotor server plugin. Its reviewed adapter
registers the bundled skills and production remote MCP; OpenCode owns connections,
OAuth and tool discovery. The supported acceptance baseline is v2.2.5. Discover
the actual tool schemas and preserve native user permissions.

Invoke `@fotor-connect` explicitly, or let the model select a skill by its ID.
The native `skill` tool uses an `id`, not another host's plugin-qualified slash
command. Read references from the base directory of the currently loaded skill.
Keep one source for each Fotor skill and one `fotor` MCP service. If a source
conflicts, stop and review native configuration instead of replacing user entries.

New services expose direct tools with `codemode: false`; an existing user's
setting remains authoritative. The expected direct tool prefix is `fotor_`.
Visibility, tool permission, an active connection and successful execution are
separate checks. Follow [MCP workflows](mcp-integration.md#runtime-workflow).

## Native authorization

Model login, Fotor MCP authorization and website cookies are separate states.
Check the selected OpenCode server and native MCP status with `/mcps`, Desktop
MCP controls or `opencode mcp list`. Reuse valid authorization. When native status
confirms consent is needed, use the selected server's native authentication
control or `opencode mcp auth fotor` and let the user complete the ordinary
external-browser flow. Run CLI authorization in an interactive terminal: v2.2.5
does not automatically open the browser when its input or output is redirected.
Do not use the login command as a connection probe.

Follow the shared [OAuth completion choice](mcp-integration.md#oauth-completion-choice)
before continuing. Browser success alone is insufficient: verify client completion,
callback release, authenticated tools and the requested operation. Native
credentials stay in the host store; installation, diagnosis and upgrades do not
require reading or moving them.

In v2.2.5, the native pending authorization attempt normally expires ten minutes
after authorization setup returns, with periodic cleanup. Discovery/setup time
is a separate phase. Use the shared [bounded connection recovery](mcp-integration.md#bounded-connection-recovery)
budget for automatic setup, discovery and read-only probing. Native denial,
cancellation or expiry ends the flow; report the failed stage and wait for the
user's next choice rather than starting another authorization automatically.

The plugin does not override host timeouts. In the tested source, startup and
catalog defaults are thirty seconds and execution defaults to twelve hours.
Existing user timeout settings remain effective. A long configured limit is not
evidence that a request completed or that retrying an unknown submission is safe.

## Website routes

Prepare the browser and confirm its current website state before requesting a
one-time link. OAuth always uses an ordinary external browser.

| Client | Requested website route |
| --- | --- |
| OpenCode CLI | The user's ordinary external browser, through an available native capability or a correctly quoted shell command with the required permission |
| OpenCode Desktop | The native browser attached to the current session; inspect its available browser tools and tab identity |

Desktop browser tools may be exposed through Code Mode independently of Fotor's
direct MCP tools. Open the native browser panel in the current Desktop session
before requesting a handoff; use the tab ID returned by its browser tools.
If the requested browser route is unavailable, stop that step,
explain the limitation and obtain the user's route choice. Keep automatic opening
and manual fallback separate. Preserve all existing browser sessions.

Follow [website connection](mcp-integration.md#connect-to-the-website): request
one handoff URL, check its production origin and expiry, open the original value
once, and wait for the user's page result. Do not prefetch, rewrite or consume it
again. MCP installation or connection does not by itself request website access.

## Updates, removal and retained configuration

Use the native plugin manager for npm/Git packages. Exact npm versions and full
Git commits stay pinned; mutable npm targets and Git references can be checked
and updated. A Git source resolves its selected Git revision, not the latest
GitHub Release. Local directories are configured in the native plugin list;
changing them and reloading is not public-source installation or upgrade evidence.

Preserve the exact server name and production URL, which contribute to the
host's credential identity. A reinstalled or updated package still establishes
a connection but may reuse its valid authorization. Native plugin removal is
not credential revocation. CLI and Desktop can share configuration and grants;
record the active server instead of assuming each client has a separate store.

Disable the whole server plugin through the native plugin configuration. Desktop's
GUI-extension switch only controls a plugin's GUI, which this package does not
provide. After a change, verify the actual package path, version, six current
skills and one Fotor service in a new session. Closing a window does not prove
that the background server restarted.

## Versioned host limitations

OpenCode v2.2.5 retries transient connection and catalog work. Its ordinary
tool-call path does not use that general retry helper. When a remote transport
has a server-issued MCP session ID, a classified session-expired response can
cause a reconnect and one replay of a tool call. A stateful local fixture accepted
one assistant call twice under that condition, including a simulated website-link
request. Ordinary dropped responses were not replayed in that fixture. A
stateless transport without that ID does not enter this recovery path; the
application's conversation ID is separate.

Normal Fotor website handoff passed on CLI and Desktop v2.2.5 using the routes
above and an existing MCP grant. One handoff tool call and one visible navigation
were observed per client, with user-confirmed sign-in. These normal-path results do not
prove a generic host fault fixed or cover production failure injection, media
execution or other client versions.

The host converts MCP `isError` responses to failures using their text content.
Fields supplied only in structured error data can be lost; equivalent JSON text
preserves the information through this conversion. The fixture confirmed this
distinction for task IDs, states and zero credits. Retain visible task IDs, states
and safe error details; missing data remains unknown. Follow
[submission recovery](mcp-integration.md#submission-recovery-and-results) and never
automatically repeat a submission whose outcome is uncertain.

These limitations do not change the shared pre-submission credit notice or add
a repeated host-specific warning to every request. Verify a future installed
client and rerun the affected scenario before removing a recorded limitation.

Sources: [native MCP client](https://github.com/anomalyco/opencode/blob/9bbb8ce18c80f099e0e448775f59d965ead40a21/packages/core/src/mcp/client.ts),
[session recovery](https://github.com/anomalyco/opencode/blob/9bbb8ce18c80f099e0e448775f59d965ead40a21/packages/core/src/mcp/index.ts),
[tool results](https://github.com/anomalyco/opencode/blob/9bbb8ce18c80f099e0e448775f59d965ead40a21/packages/core/src/tool/mcp.ts),
and [authorization lifetime](https://github.com/anomalyco/opencode/blob/9bbb8ce18c80f099e0e448775f59d965ead40a21/packages/core/src/integration.ts).
