# Boon

Core platform project.

## Development

**Lint & format**

- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run format:check` — check formatting

**Tests**

- `npm test` — run tests once
- `npm run test:watch` — run tests in watch mode

**Server**

- `npm run dev` — start server (default http://localhost:3000)
- `PORT=3001 npm run dev` — run on a different port

**Web client**

- `npx ts-node web/index.ts` — fetch health from server (server must be running)
