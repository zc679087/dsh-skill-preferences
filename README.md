# dsh-skill-preferences

Turn individual [DSH](https://github.com/deepseek-ai/deepseek-harness) skills on and off from user settings.

Installs as an ordinary Cordis plugin. **It modifies no DSH source file** — no patched registry, no forked package, no rebuild of the host.

## Install

Install into the DSH profile you want it in — `$DSH_HOME/profiles/<profile>/`, never into the DSH source tree:

```sh
cd "$DSH_HOME/profiles/headless"   # or web, tui, ...
pnpm add dsh-skill-preferences
```

Then add one row to that profile's own user patch layer, `$DSH_HOME/profiles/<profile>/cordis.patch.yml`:

```yaml
- insert:
    - id: skill-preferences
      name: 'dsh-skill-preferences'
```

That file is applied after every bundle layer, so nothing in the DSH installation changes.

### Compositions that discover skills inside agent presets

The row above governs the registry's **global** layer. A composition may instead disable the host
`skill-filesystem` row and let each agent preset discover its own skills — the Web bundle does
exactly that. A nearer scope layer replaces the global layer's same-name entry outright, so in
that shape the global row alone suppresses nothing and the settings page has nothing to list.

Add the preset half wherever `skill-filesystem` is mounted, in the preset's `agent.cordis.yml`:

```yaml
- id: skill-preferences-preset
  name: 'dsh-skill-preferences/preset'
```

It owns no settings — the host row publishes the policy service it reads, and registering it also
tells the settings face which scopes to read, so the page lists the catalog those agents see.

Restart the host.

To remove the feature, delete the row and uninstall the package; the stored settings section is left alone and simply stops being read.

## Settings

```yaml
skill-preferences:
  disabled:
    - pdf
    - nature-figure
  hints:
    pdf:
      description: "Use this skill whenever the user wants to do anything with PDF files..."
      source: bundled
```

`disabled` is the only authority. `hints` is display metadata captured when a skill was turned off, so a settings page can still render a truthful row for a skill it can no longer read; deleting the whole `hints` section only degrades display.

## Remote API

The plugin publishes its own RPC face for a settings UI. The Typert Gateway claims it by
reflection from the live service, so no generated host artifact and no change to the DSH API
gateway is involved:

| Endpoint | Args | Returns |
|---|---|---|
| `skillPreferences/list` | `{ query: { cwd?: string } }` | every skill with its preference state |
| `skillPreferences/setEnabled` | `{ change: { name, enabled, cwd? } }` | the table after the change committed |

The face exists only while a settings service does, since it writes settings. A composition
without an API gateway (headless, ACP) mounts it harmlessly and never dispatches to it.

Reading the catalog here rather than through DSH's own `skill.list` RPC is deliberate: that RPC
requires a session id and already filters to user-invocable skills, so it can never show a
settings page the very rows it exists to edit.

`cwd` is optional and selects project-level discovery; omitted, the global catalog is read.

## How disabling works

A disabled skill is **not** filtered out at a consumer. Filtering at one consumer is bypassable by any other caller of `ctx.skills.get()`, so it would not be enforcement.

Instead this plugin registers a normal skill provider that contributes a candidate for each disabled name at rank `0` — ahead of every packaged source, which start at 100 — carrying `invocation: { modelInvocable: false, userInvocable: false }`. The registry resolves the name to that entry, so `list()`, `snapshot()`, and `get()` all agree, and every consumer denies the skill through the invocation policy it already checks:

| Surface | Result |
|---|---|
| Model-facing skill catalog | the skill is absent |
| `skill` tool load | refused as not model-invocable |
| `/<skill-name>` user gesture | not injected; stays plain prose |
| Web `/` skill popup | the skill is absent |

Committed settings changes invalidate the catalog and emit `skills/change`, so nothing needs restarting.

## Web UI

The same package carries the browser half. `dsh.client` plus `exports["./client"]` is what the
host's client-module scanner looks for, and it resolves plugin packages from the profile's own
`node_modules` at runtime — so the one `cordis.patch.yml` row above installs both halves and DSH
is never rebuilt.

The tab lands in **Settings → Plugins → Skills**. Each row shows the skill name, description,
source, and its resolved model/user invocation state, with a switch per skill and a search box.
A failed write re-reads from the host rather than keeping a local guess.

The Remote namespace is mounted by this plugin from its own hand-written Typert contribution
(`src/remote.ts`), not from the `@deepseek-ai/dsh-api-remotes` mount list — that list is that
assembly's own selection, not the only way in. Both the namespace and the tab ride `ctx.effect`,
so unloading the plugin withdraws them together.

A new client plugin reaches the browser through `window.__DSH_BOOT__`, which is composed when the
host serves index.html — so the first install needs a host restart and a page reload.

## Timing

- **Catalog visibility** refreshes on the next agent step.
- **Load interception is immediate**: a skill turned off mid-turn is refused for the rest of that same turn.

## Known limits

1. **Preset-layer skills need the preset row.** The registry resolves the nearest scope layer's entry ahead of the global layer outright, so the host row alone cannot suppress a skill an agent preset discovered. Mount `dsh-skill-preferences/preset` in that preset (see Install). Without it the plugin is inert in any composition that disables the host `skill-filesystem` row.
2. **Mount it exactly once, in the host composition.** `ctx.settings.register()` is not scope-layered and throws on a duplicate namespace, so mounting this per agent preset fails on the second mount.
3. **One warning line per suppressed skill per cold catalog collect** (`skill "x" from y ignored because a higher-priority skill already exists`). That is the registry's existing shadowing notice, not an error.
4. **A name added to `disabled` by hand has no description** until it is enabled and disabled once through the UI, because the hint is captured at disable time.

## Development

```sh
pnpm build
pnpm test
```
