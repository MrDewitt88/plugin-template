# MCP UI resources over the Plugin Bridge

Implemented in Bridge Foundation **0.21.0**, Generator **0.15.0**; template **0.8.0**.

This is the provider and resource-client path for MCP Apps. A host still owns
the sandbox, permissions, originating-plugin tool dispatch and chat placement.
It is an optional addition to Plugin Bridge v1. Existing `render-ui` routes and
Custom Elements continue to use their existing contract.

## Provider

Declare the UI URI on a tool, using its local manifest name:

```yaml
- name: items.panel
  input_schema: { type: object, properties: {}, additionalProperties: false }
  _meta:
    ui:
      resourceUri: ui://my-plugin/item-panel
      visibility: [model, app]
```

Register the resource in `createBridgeApp`:

```ts
mcpUiResources: [{
  resource: {
    uri: 'ui://my-plugin/item-panel',
    name: 'item-panel',
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
  },
  scopesRequired: ['mcp.read.my-plugin'],
  read: async ctx => loadPanelFor(ctx.tenantId, ctx.userId),
}]
```

`read` returns one HTML string. Identity comes exclusively from verified JWT
claims; the resource request has no tenant/user fields. `user_id` is preferred,
with `sub` as the canonical host user fallback. A legacy host must include its
user in `user_id`. Every resource checks the union of the plugin-wide scope
floor and `scopesRequired`, even if `enforceScopes` is false for legacy tools.
JWT audience is bound to `aud ?? plugin_id`, never `sub`.

The registry pins resource metadata and scopes at startup. Duplicate URIs,
wrong MIME types and tool references to missing resources fail startup when
MCP UI resources are enabled. URIs are exact allowlist keys, never filesystem
paths or destinations for a fetch.

## Wire

An enabled provider adds this optional field to its handshake response:

```json
{
  "mcp_ui": {
    "version": 1,
    "mime_types": ["text/html;profile=mcp-app"],
    "resources_list_endpoint": "/plugin-bridge/v1/resources/list",
    "resources_read_endpoint": "/plugin-bridge/v1/resources/read"
  }
}
```

Both endpoints require a verified Bearer token. They are mounted only when
`mcpUiResources` is supplied. They use MCP resource payloads, without the
`execute-tool` `ok/result` envelope and without a JSON-RPC envelope:

| Operation | Request | Response |
| --- | --- | --- |
| `POST /plugin-bridge/v1/resources/list` | `{}` | `{ "resources": [{ "uri", "name", "mimeType", "_meta" }] }` |
| `POST /plugin-bridge/v1/resources/read` | `{ "uri": "ui://my-plugin/item-panel" }` | `{ "contents": [{ "uri", "mimeType", "text", "_meta" }] }` |

The MIME is exactly `text/html;profile=mcp-app`. Resource `_meta.ui` carries
CSP and permission requests; these do not belong on a tool descriptor.
Discovery filters out resources without the required scopes. Reads return
401 for authentication/audience failure, 403 for missing scopes, 404 for an
unregistered URI, 400 for invalid requests, 413 for a request over 4 KiB, and
500 for a failed/invalid provider read. Error bodies use
`{ "error": { "code", "message" } }`; provider diagnostics are redacted.

Limits: 128 resources, one HTML content item per read, 512 KiB UTF-8 HTML and
8 KiB resource metadata. Oversized HTML is rejected, never truncated into a
partial executable document. Responses use `Cache-Control: no-store`.

## Host adapter

```ts
import { createMcpUiResourceClient } from '@nexus-mindgarden/plugin-bridge-foundation'

const resources = createMcpUiResourceClient({
  bridgeEndpoint: authorizedPlugin.serviceEndpoint,
  tokenResolver: () => authorizedPlugin.currentBearer(),
})
const catalog = await resources.list()
const document = await resources.read(tool._meta.ui.resourceUri)
```

The helper re-reads the token for every request, bounds and validates responses,
requires the returned URI to equal the requested URI, refuses redirects and
does not send cookies. It maps MCP `resources/list` / `resources/read` onto the
two bridge endpoints. It does not expose an independent MCP transport.

The host must bind every resource and UI action to the originating plugin and
current agent/tenant session. Mount the HTML in an opaque sandboxed iframe,
apply `_meta.ui.csp` and permissions, use the official MCP Apps `AppBridge`
channel, deliver tool input/result notifications, and route UI tool calls
through the existing executor and permission gates. Prefix local tool names
with the originating plugin ID inside the host, then strip that outer prefix
exactly once when forwarding to `execute-tool`. The iframe receives no bridge
bearer token. `[app]`-only tools remain hidden from the model.

Theseus' existing stdio MCP App view is a separate integration. This release
does not add its external-service adapter, inline chat placement or native
goMind Android/iOS mounts.

## Generator and verification

```sh
create-plugin my-plugin --features=mcp-ui
cd my-plugin
pnpm install
pnpm build
```

The feature implies `bridge` and adds `packages/my-plugin-mcp-ui`. It builds
`dist-plugin/item-panel.html`, included by the existing bundle packer. The HTML
contains its inline SDK/JS/CSS, requires no CDN/network assets, and rejects a
build exceeding 512 KiB. The view uses the official SDK **2.0.3** prebundled
`app-with-deps` entry. Tool results are rendered with `textContent`; the refresh
button calls `items.panel` through the host.

The generated source must be built before resource reads. A missing asset is a
`resource_read_failed` response; the public liveness probe remains available.

Provider regression tests cover authorization, scope filtering, token-only
identity, unknown URIs, malformed requests, byte limits and redacted errors.
The generator test compiles both packages and reads the real bundled HTML.
The optional browser release smoke uses the official host and view SDKs:

```sh
MCP_UI_BROWSER=1 pnpm --filter @nexus-mindgarden/create-plugin exec vitest run test/generated-mcp-ui.test.ts
```

Install Playwright Chromium first, or set `MCP_UI_BROWSER_EXECUTABLE` to a local
Chromium executable. The smoke verifies initialization, input/result delivery,
a UI-to-provider tool roundtrip, opaque-origin DOM isolation, deny-by-default
CSP and 320/360/390/430 px layouts. This browser smoke is not native device
qualification.

Protocol reference: [official MCP Apps overview](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/overview.md).
