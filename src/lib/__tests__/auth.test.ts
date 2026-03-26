// auth.ts es código server-only que usa Web Crypto (vía jose) y next/headers.
// El entorno "node" es el correcto aquí: evita el problema de Uint8Array cross-realm
// que ocurre en jsdom y refleja mejor dónde corre este código en producción.
// @vitest-environment node

// Vitest eleva los vi.mock() automáticamente al tope del archivo,
// por eso es seguro declararlos aquí aunque los imports vengan después.
import { vi, describe, it, expect, beforeEach } from "vitest";

// "server-only" lanza un error si se importa fuera de un Server Component de Next.js.
// En el entorno de test no existe ese contexto, así que lo neutralizamos con un módulo vacío.
vi.mock("server-only", () => ({}));

// cookies() de next/headers lee la cabecera HTTP de la petición en curso,
// algo que no existe en un test unitario. Lo reemplazamos con un mock
// que podemos controlar test a test.
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} from "@/lib/auth";

// La misma clave que usa auth.ts cuando no hay variable de entorno configurada.
// Esto nos permite firmar tokens en los tests que sean verificables por el código real.
const JWT_SECRET = new TextEncoder().encode("development-secret-key");

/** Firma un JWT con el mismo algoritmo y clave que usa auth.ts */
const signToken = async (
  payload: Record<string, unknown>,
  expiresIn: string | number = "7d"
) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);

/** Crea un NextRequest con la cookie de sesión ya incluida en las cabeceras */
const requestWithToken = (token: string) =>
  new NextRequest("http://localhost/", {
    headers: { cookie: `auth-token=${token}` },
  });

// Limpiamos los mocks entre cada test para que los spy calls de un test
// no contaminen las aserciones del siguiente.
beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createSession ────────────────────────────────────────────────────────────

describe("createSession", () => {
  it("llama a cookieStore.set con el nombre de cookie correcto y las opciones de seguridad", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledOnce();

    const [cookieName, , options] = mockCookieStore.set.mock.calls[0];
    expect(cookieName).toBe("auth-token");
    // httpOnly evita que el JS del cliente lea la cookie (protección XSS)
    expect(options.httpOnly).toBe(true);
    // sameSite=lax protege contra CSRF mientras permite navegación normal entre páginas
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("establece la expiración de la cookie aproximadamente 7 días en el futuro", async () => {
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const [, , options] = mockCookieStore.set.mock.calls[0];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Comprobamos que la expiración cae dentro de la ventana de ejecución del test (±5 s)
    expect(options.expires.getTime()).toBeGreaterThanOrEqual(
      before + sevenDaysMs - 5000
    );
    expect(options.expires.getTime()).toBeLessThanOrEqual(
      after + sevenDaysMs + 5000
    );
  });

  it("el JWT generado contiene userId y email en el payload", async () => {
    await createSession("user-456", "hello@example.com");

    const [, token] = mockCookieStore.set.mock.calls[0];

    // Verificamos el token con la misma clave para leer el payload real
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.userId).toBe("user-456");
    expect(payload.email).toBe("hello@example.com");
  });

  it("en entorno de test (no producción) la cookie NO tiene el flag secure", async () => {
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieStore.set.mock.calls[0];
    // NODE_ENV es "test" en Vitest, no "production", por lo que secure debe ser false
    expect(options.secure).toBe(false);
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe("getSession", () => {
  it("devuelve null cuando no hay cookie de sesión", async () => {
    // get() devuelve undefined → no hay token → la función debe retornar null
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("devuelve el SessionPayload correcto para un token válido", async () => {
    const token = await signToken({
      userId: "user-789",
      email: "valid@example.com",
      expiresAt: new Date(),
    });
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user-789");
    expect(session!.email).toBe("valid@example.com");
  });

  it("devuelve null cuando el token es un string malformado", async () => {
    mockCookieStore.get.mockReturnValue({ value: "esto-no-es-un-jwt" });

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("devuelve null cuando el token ha expirado", async () => {
    // exp en el pasado: unix timestamp de hace 1 segundo
    const expiredToken = await signToken(
      { userId: "user-000", email: "expired@example.com" },
      Math.floor(Date.now() / 1000) - 1 // ya caducado
    );
    mockCookieStore.get.mockReturnValue({ value: expiredToken });

    const session = await getSession();
    expect(session).toBeNull();
  });
});

// ─── deleteSession ────────────────────────────────────────────────────────────

describe("deleteSession", () => {
  it("elimina la cookie auth-token del store", async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledOnce();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

// ─── verifySession ────────────────────────────────────────────────────────────

describe("verifySession", () => {
  it("devuelve null cuando el request no contiene la cookie auth-token", async () => {
    const request = new NextRequest("http://localhost/");

    const session = await verifySession(request);
    expect(session).toBeNull();
  });

  it("devuelve el SessionPayload correcto para un token válido en el request", async () => {
    const token = await signToken({
      userId: "user-req-1",
      email: "req@example.com",
      expiresAt: new Date(),
    });

    const session = await verifySession(requestWithToken(token));

    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user-req-1");
    expect(session!.email).toBe("req@example.com");
  });

  it("devuelve null cuando el token del request está malformado", async () => {
    const session = await verifySession(requestWithToken("token-invalido"));
    expect(session).toBeNull();
  });

  it("devuelve null cuando el token del request ha expirado", async () => {
    const expiredToken = await signToken(
      { userId: "user-req-2", email: "old@example.com" },
      Math.floor(Date.now() / 1000) - 1
    );

    const session = await verifySession(requestWithToken(expiredToken));
    expect(session).toBeNull();
  });
});