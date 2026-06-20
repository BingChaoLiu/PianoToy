# Codex Agents Instructions - Piano Practice Project

## Project Context
This is a Tauri 2 desktop piano learning application located at `C:\Users\Administrator\Documents\Piano\desktop`.
The user is a programmer learning piano, and this app combines piano practice with rhythm game elements.

See `desktop/MEMORY.md` for comprehensive project documentation.

## Key Rules
1. Only modify files under `desktop/src/` (frontend code)
2. Never modify `src-tauri/`, `scripts/`, `node_modules/`, `dist/`
   EXCEPTION: the scores filesystem subsystem is permitted — extending the
   `get_scores_root` / `list_score_folders` / `delete_score_folder` commands
   (and their helpers `validate_folder_name` / `safe_join` / `scores_root`) in
   `src-tauri/src/lib.rs` is allowed when working on score storage features.
3. Maintain 6-language i18n: add all new text to zh-CN, en, ja, es, fr, de locale files
4. Use existing Zustand store architecture; no new state management libraries
5. No accounts, paid services, or online features
6. Public domain MIDI content only (composers deceased 70+ years)
7. Append-only i18n keys; never change existing key semantics

## Verification
After any change:
```powershell
npm run build    # Must pass cleanly
npm test         # All 174 tests must pass
```

## PowerShell Notes
- No `&&` operator; use `;` or separate commands
- Inline `-e` scripts break with quoting; use `@'...'@ | node -` heredoc
- `cargo tauri build` may report exit code 1 falsely; check for "Finished N bundles" in output
- Always prepend `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` for cargo access
