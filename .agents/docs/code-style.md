# Code Style

Formatting is handled by `oxfmt` — run `bun run fmt` and don't worry about whitespace or semicolons.

## Imports

- Group: stdlib (`node:*`) → external deps → internal modules
- Use named imports with relative paths (no file extension)
- Example: `import { json, error } from "../lib/response"`

## Naming

- **Files**: kebab-case (`auth-handlers.ts`)
- **Functions**: camelCase (`createAuthHandlers`)
- **Types/Interfaces**: PascalCase (`AppContext`, `RouteDefinition`)
- **Constants**: SCREAMING_SNAKE_CASE
- **Private**: underscore prefix (`_cache`)
- **Database columns**: snake_case
- **URL params**: lowercase with dashes

## Error Handling

Handlers throw `Response` objects for auth/validation failures:

```typescript
try {
  // handler logic
} catch (e) {
  if (e instanceof Response) return e;
  ctx.logger.error({ err: e }, "context");
  return serverError();
}
```

Use `error(message, status)` from `src/lib/response.ts` for error responses.
