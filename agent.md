# Mimo — Agent Instructions

## Project

Mimo is a family virtual-pet application for children and parents.

Primary stack:

- Next.js + TypeScript
- NestJS
- PostgreSQL + Prisma
- Redis + BullMQ
- FastAPI
- pnpm workspaces
- Docker

## Core principles

- Mobile-first.
- Child safety is a priority.
- No ads or public child profiles.
- A creature must never die.
- Never use guilt-based mechanics.
- Parent and child permissions must remain strictly separated.
- Backend is the source of truth for game state.

## Repository

apps/web Next.js frontend
apps/api NestJS API
apps/engine FastAPI game engine
packages/ui shared UI
packages/types shared TypeScript types
packages/game-data game definitions
docs/ project documentation

## Development rules

- TypeScript strict mode.
- Avoid `any`.
- Do not hardcode game configuration in UI components.
- Prefer reusable components.
- Never commit secrets.
- Update `.env.example` when adding environment variables.
- Keep architecture documentation updated.

## Validation

Before considering work complete:

1. Run lint.
2. Run typecheck.
3. Run tests.
4. Run relevant E2E tests.
5. Fix failures instead of bypassing them.

## UX

Target devices:

- phones
- tablets
- desktop

Children UI should be playful but not childish.
Parent UI should be simpler and more utilitarian.

## Agent behavior

Work autonomously.

Do not stop after planning.
Inspect the repository, implement the feature, run it, test it and fix issues.

Ask the user only when:

- credentials are required;
- money would be spent;
- an irreversible operation is required;
- a major product decision has no obvious default.

See:

- README.md
- docs/ARCHITECTURE.md
- docs/GAME_DESIGN.md
- docs/SECURITY.md
