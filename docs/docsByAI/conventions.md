# Documentation and Folder Conventions

- Required per-folder README.md in:
  - `server/`
  - `server/src/`
  - `clients/`
  - `clients/addin/`
  - `clients/web/`
  - `clients/shared/`
  - `data/`
  - `data/app/`
- Optional: leaf folders only if their purpose isn’t obvious (e.g., `server/scripts/`).
- Not needed: simple leaf data directories (e.g., `data/app/exhibits/`, `data/working/*`).

Enforcement:
- A pre-commit validator checks only the required list above.
