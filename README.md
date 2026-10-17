# HTV11 foundation

This repository intentionally contains the foundation layer only: shared types, database migration scaffolding, and the minimal TypeScript build/lint configuration needed for future feature work.

## Included

- Root workspace configuration for TypeScript and ESLint
- Shared package for cross-app contracts: `@htv11/types`
- Database package and migration scaffold: `@htv11/db`
- Minimal app shells for API and Web packages

## Local commands

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

## Branching notes

Create feature branches from `setup/foundation` and keep new work scoped to Prompt 2-5 features only.
