# `.claude/settings.local.json.suggested` Template

> Skeleton-Vorlage für Plugin-Provider-Repos. Adoptiert die im mindgarden-Ökosystem etablierte Auto-Classifier-Override-Convention.

## Hintergrund

Claude-Code's Auto-Classifier blockt destruktive oder weitreichende Bash-Commands (DB-writes, `git push --force`, `rm -rf`, etc.) per default. Plugin-Provider-Repos brauchen aber Routine-Operations (`pnpm install`, `gh pr merge`, `git push origin main`) ohne ständigen User-Prompt.

**Lösung-Pattern** (etabliert 2026-05-17 in 6+ Repos):
1. **CC schreibt `.claude/settings.local.json.suggested`** als neuen File. Self-Modification-Block verhindert direkten Edit von `settings.local.json`.
2. **User merged manuell:** `cp .claude/settings.local.json.suggested .claude/settings.local.json` ODER via `/update-config`-Skill rule-für-rule.
3. **`.suggested` ist commit-by-default** (kein gitignore) — dient als Convention-Seed für neue Contributors + Cross-CC-Coordination.

## Skeleton (anpassen je nach Stack)

```jsonc
{
  "_meta": {
    "purpose": "Auto-Classifier-Override für <PLUGIN-NAME>",
    "merge_command_for_user": "cp .claude/settings.local.json.suggested .claude/settings.local.json",
    "convention_source": "mindgarden-ökosystem 2026-05-17",
    "last_updated": "<YYYY-MM-DD>"
  },
  "permissions": {
    "allow": [
      // === pnpm / bun / npm workspace flow ===
      "Bash(pnpm install:*)",
      "Bash(pnpm install --frozen-lockfile:*)",
      "Bash(pnpm -r:*)",
      "Bash(pnpm --filter:*)",
      "Bash(pnpm typecheck:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm build:*)",
      "Bash(pnpm dev:*)",        // wenn deine Plugin-Bridge dev-server hat
      "Bash(pnpm lint:*)",

      // === git scoped-push (no force) ===
      "Bash(git push origin main:*)",
      "Bash(git push origin feat/:*)",
      "Bash(git push origin fix/:*)",
      "Bash(git push origin docs/:*)",
      "Bash(git push origin chore/:*)",
      "Bash(git push origin v0.:*)",
      "Bash(git tag:*)",
      "Bash(git fetch origin:*)",

      // === gh PR-Flow ===
      "Bash(gh pr create:*)",
      "Bash(gh pr edit:*)",
      "Bash(gh pr view:*)",
      "Bash(gh pr merge:*)",
      "Bash(gh pr list:*)",
      "Bash(gh run view:*)",
      "Bash(gh run list:*)",
      "Bash(gh auth status)",
      "Bash(gh auth setup-git)",

      // === plugin-bridge probes (scoped auf eigenen Port) ===
      "Bash(curl -s http://127.0.0.1:<PORT>:*)",     // Drift #203 — IMMER 127.0.0.1
      "Bash(curl -sI http://127.0.0.1:<PORT>:*)",
      "Bash(nc -z 127.0.0.1 <PORT>)",

      // === Cross-Repo-Smoke-Targets ===
      "Bash(curl -s http://127.0.0.1:3100:*)",       // V8
      "Bash(curl -s http://127.0.0.1:3500:*)",       // markview
      "Bash(curl -s http://127.0.0.1:3650:*)"        // plug-elec (ET-Mind)
      // ergänze je nach Cross-Repo-Dependencies
    ]
  },
  "_notes": {
    "rationale": "Begründe Plugin-spezifische Einträge.",
    "bleibt_classifier_gated": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git reset --hard:*)",
      "Bash(git stash --include-untracked:*)",
      "Bash(docker system prune:*)",
      "Bash(pnpm publish:*)",
      "Bash(npm publish:*)",
      "Edit auf .claude/settings.local.json (Self-Modification-Block)"
    ]
  }
}
```

## Optional-Erweiterungen je Stack

### Plugin mit Python-Tooling (z.B. plug-db, plug-elec)

```json
"Bash(uv run pytest:*)",
"Bash(uv run ruff:*)",
"Bash(uv run mypy:*)",
"Bash(uv run python scripts/:*)",
"Bash(huggingface-cli download:*)"
```

### Plugin mit Docker-Compose-Stack (z.B. plug-db)

```json
"Bash(docker compose up -d:*)",
"Bash(docker compose down:*)",
"Bash(docker compose down -v:*)",
"Bash(docker compose build:*)",
"Bash(docker logs <prefix>-:*)",
"Bash(docker exec <prefix>-:*)"
```

### Plugin mit Postgres-Migrations (z.B. v8-corp, v8-fam, plug-db)

```json
"Bash(psql -d <plugin>_dev:*)",    // scoped auf dev-DB, NICHT generic psql:*
"Bash(./scripts/migrate.sh:*)"
```

## Convention-Frage: commit oder gitignore?

**Default in mindgarden 2026-05-17: commit.** Begründung:
- Seed für neue Contributors / Cross-CC-Coordination
- Keine Secrets (keine API-Keys, keine prod-DB-URLs)
- Drift-Risiko niedrig (Convention stable)

**V8-Divergenz:** TeamMindV8 hat `.claude/` komplett gitignored. Bei dieser Wahl: `.suggested` ebenfalls local-only, User muss separate Cross-Repo-Sync machen.

## Override-Marker in CLAUDE.md (optional, V8-Pattern)

Manche Repos (V8, plug-ea) ergänzen einen Override-Marker-§ in `CLAUDE.md` für explicit user-intent signaling:

```md
## §X.5 Auto-Mode-Classifier Override Markers

Explizite User-Intent-Markers triggern Override des Classifiers (zusätzlich zu
allow-list in `.claude/settings.local.json`):

- "Server starten" / "starte den Dev-Server" → erlaubt `pnpm dev` / `bun run dev`
- "Bridge starten" → erlaubt Bridge-Restart
- "GO für smoke" → erlaubt Test-Suite-Run mit Side-Effects
- "alle Dienste starten" → erlaubt Multi-Service-Boot
```

Plus canonical Start-Command:
```bash
set -a; source .env.local; set +a; pnpm --filter @<plugin>/bridge dev
```

## Cross-Repo-Source

Convention etabliert in mindgarden 2026-05-17 nach @human's Auto-Classifier-Frage (chatbus #211). Erste Adopter:

- **plug-design** (Design-Mind) — 34 Rules, gh-Flow + workspace + workbench-curl
- **plug-elec** (ET-Mind) — 16 Rules, git-push + uv + codegen
- **plug-db** (UnifiedDBV5) — docker compose + uv + curl-localhost + HF-CLI
- **v8-corp** (TeamMindV8) — bun + gh + psql-scoped + CLAUDE.md §10.5
- **oracle/plug-ea** (EA-Mind) — pnpm workspace + Bridge :3660 + CLAUDE.md §11.5
- **plug-tmpl** — `.claude/settings.local.json.suggested` als Reference-Seed (dies hier)

## Siehe auch

- [`PLUGIN-PROVIDER-GUIDE.md`](../PLUGIN-PROVIDER-GUIDE.md) §4 — manifest Drifts #200/#203/#206
- [`CLAUDE-TEMPLATE.md`](../CLAUDE-TEMPLATE.md) — Engineering-Regeln für Plugin-Provider-CCs
