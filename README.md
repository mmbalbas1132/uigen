# UIGen

Generador de componentes React con IA y vista previa en tiempo real.

## Requisitos previos

- Node.js 18+
- npm

## Configuración inicial

1. **Opcional** — Edita `.env` y añade tu API key de Anthropic:

```
ANTHROPIC_API_KEY=tu-api-key-aqui
```

El proyecto funciona sin API key. En ese caso, en lugar de usar un LLM para generar componentes, devuelve código estático de ejemplo.

2. Instala las dependencias e inicializa la base de datos:

```bash
npm run setup
```

Este comando:

- Instala todas las dependencias
- 
- Genera el cliente de Prisma
- Ejecuta las migraciones de la base de datos

## Ejecutar la aplicación

### Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Uso

1. Regístrate o continúa como usuario anónimo
2. Describe en el chat el componente React que quieres crear
3. Observa el componente generado en la vista previa en tiempo real
4. Cambia a la vista de Código para ver y editar los archivos generados
5. Sigue iterando con la IA para refinar tus componentes

## Características

- Generación de componentes con IA usando Claude
- Vista previa en vivo con recarga automática
- Sistema de archivos virtual (no escribe archivos en disco)
- Editor de código con resaltado de sintaxis
- Persistencia de componentes para usuarios registrados
- Exportación del código generado

## Stack tecnológico

- Next.js 15 con App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma con SQLite
- Anthropic Claude AI
- Vercel AI SDK
