# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

---

## Qué es este proyecto

**UIGen** es un generador de componentes React con IA y vista previa en tiempo real. El usuario describe una interfaz en lenguaje natural, la IA genera componentes React + Tailwind mediante tool calls, y el resultado se renderiza al instante en una vista previa en sandbox — todo sin tocar el sistema de archivos real.

---

## Comandos

```bash
npm run setup        # Configuración inicial: instalar + prisma generate + migrate
npm run dev          # Servidor de desarrollo en :3000 (Turbopack)
npm run build        # Build de producción
npm run test         # Ejecutar todos los tests (Vitest)
npm run db:reset     # Resetear la base de datos (destructivo)
```

Ejecutar un solo archivo de tests:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
```

Ejecutar tests en modo watch:
```bash
npx vitest
```

---

## Arquitectura

### Stack tecnológico
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Vercel AI SDK** (`ai`) con `@ai-sdk/anthropic` para respuestas en streaming con tool calls
- **Prisma** (SQLite en desarrollo, via `prisma/schema.prisma`)
- **Tailwind CSS v4** (plugin de PostCSS, sin archivo de configuración)
- **shadcn/ui** (estilo new-york, base neutral, en `src/components/ui/`)
- **Vitest** + Testing Library + jsdom para tests

### Conceptos arquitectónicos clave

**Sistema de archivos virtual** — Todos los archivos generados viven solo en memoria. `VirtualFileSystem` (`src/lib/file-system.ts`) es un `Map<ruta, FileNode>` en el que la IA escribe mediante tool calls. Nunca toca el disco. Se serializa a JSON para persistir en la BD (columna `Project.data`).

- Las rutas se normalizan con prefijo `/`, sin barras finales. Los alias `@/` se resuelven automáticamente.
- `createFile()` crea los directorios padre automáticamente.
- Dos métodos de deserialización: `deserialize()` para mapas planos `Record<string, string>`, y `deserializeFromNodes()` para estructuras de nodos completas.
- Existen **dos instancias separadas de VirtualFileSystem**: una que se reconstruye por petición en `route.ts` (para que las herramientas de la IA escriban en ella) y otra en `FileSystemContext` (para la UI). `handleToolCall()` sincroniza los resultados de las herramientas en el FS del lado cliente.

**Tool calls de la IA** — La ruta `/api/chat` (`src/app/api/chat/route.ts`) transmite respuestas usando Vercel AI SDK. La IA dispone de dos herramientas:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`): operaciones view / create / str_replace / insert sobre el FS virtual. Devuelve strings.
- `file_manager` (`src/lib/tools/file-manager.ts`): rename / delete. Devuelve `{ success, error, message }`.

El FS serializado se envía en cada petición via `body: { files: fileSystem.serialize(), projectId }` en `useAIChat()`. `maxSteps` es 40 para Claude real, 4 para el mock provider.

**Gestión de estado** — Dos contextos de React:
- `ChatContext` (`src/lib/contexts/chat-context.tsx`): mensajes, estado del input, manejador de envío
- `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`): operaciones sobre el FS virtual, procesamiento de tool calls, triggers de refresco para la vista previa

**Vista previa en vivo** — `PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) renderiza dentro de un iframe con sandbox. Orden de detección del punto de entrada: `/App.jsx` → `/App.tsx` → `/index.jsx` → `/index.tsx` → variantes en `/src/App.jsx` → primer `.jsx`/`.tsx` encontrado. La vista previa re-renderiza el FS completo en cada refresco (sin actualizaciones incrementales).

**Transformación JSX** — `src/lib/transform/jsx-transformer.ts` usa **@babel/standalone** (compilación en el navegador) para transformar cada archivo JS/JSX/TS/TSX. Estrategia de resolución de imports:
- React → `esm.sh/react@19` (CDN)
- Archivos locales → blob URLs
- Paquetes de terceros → `esm.sh/${paquete}` automáticamente
- Los imports CSS se eliminan del JS y se inyectan como tag `<style>`
- Cada archivo se registra bajo múltiples alias en el import map (`/App.jsx`, `App.jsx`, `@/App.jsx`, `App`)

**Mock provider** — Si `ANTHROPIC_API_KEY` no está en `.env`, `src/lib/provider.ts` devuelve un `MockLanguageModel` que genera componentes de ejemplo estáticos. Establece la key para usar Claude real.

**Persistencia de sesión anónima** — `src/lib/anon-work-tracker.ts` guarda los mensajes y el FS serializado de los usuarios no autenticados en `sessionStorage` (se pierde al cerrar la pestaña). Las sesiones autenticadas persisten en `Project.data` + `Project.messages` (strings JSON en SQLite, no tablas normalizadas).

### Flujo de datos
```
Prompt del usuario
  → ChatContext.handleSubmit()
  → POST /api/chat (mensajes + VirtualFileSystem serializado)
  → Stream de IA (texto + tool calls)
  → FileSystemContext.handleToolCall() actualiza el VirtualFileSystem en memoria
  → El iframe de vista previa se re-renderiza en vivo
  → Si está autenticado: se guarda en Project.data + Project.messages (strings JSON en SQLite)
```

### Autenticación
JWT con cookies httpOnly (`auth-token`, 7 días de expiración, HS256). Establece `JWT_SECRET` en `.env`. Las server actions en `src/actions/index.ts` gestionan signUp / signIn / signOut / getUser. El middleware (`src/middleware.ts`) protege `/api/projects/*` y `/api/filesystem/*`.

### Layout de la UI
`MainContent` (`src/app/main-content.tsx`) renderiza un split redimensionable:
- Izquierda 35%: Chat (`src/components/chat/`)
- Derecha 65%: Vista previa (por defecto) o vista de Código (árbol de archivos 30% + editor Monaco 70%)

---

## Convenciones

- Alias de ruta `@/*` apunta a `src/*`
- Las server actions usan `"use server"`, devuelven `{ success, error }` y llaman a `revalidatePath()` tras mutaciones
- Los tests viven en subdirectorios `__tests__/` junto al código que prueban
- Nomenclatura de tests: `describe('NombreClase')` → `it('método hace X')`
- El system prompt para generación de componentes está en `src/lib/prompts/generation.tsx`
- En los tests, los componentes hijo suelen mockearse con `vi.mock()` devolviendo divs simples con atributos `data-testid`

---

## Variables de entorno

```
ANTHROPIC_API_KEY=   # Dejar vacío para usar el mock provider
JWT_SECRET=          # Por defecto "development-secret-key" si no se establece
```

El shim `node-compat.cjs` en la raíz del proyecto parchea las variables globales de Node.js para compatibilidad con versiones más nuevas. Es necesario al arrancar via `NODE_OPTIONS` en todos los scripts.
