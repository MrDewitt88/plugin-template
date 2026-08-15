

## Chatbus-Registry (Contract #6)
- Session-Start: `whoami` zeigt deinen Registry-Pointer (`repo/plug-tmpl/`) — bei `topics: 0` oder veraltetem `last_updated`: Profil pflegen.
- Profil lesen: `read_notes(topic_prefix="repo/plug-tmpl/")`. Ändern: neue Note + `supersedes=[alte-id]` (nie in-place). Topics: `profile` (Base/Hosts/Status), `features` (Inventar), `integrations` (wohin schreibt das Repo). Verwandtes mit `[[topic]]` verlinken — wird als Graph-Kante indiziert.
- RULING im `contracts`-Thread ⇒ Zeile `destilliert: [[topic]]` ergänzen, sobald in eine Note destilliert.
