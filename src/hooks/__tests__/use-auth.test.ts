import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─── Mocks de dependencias externas ───────────────────────────────────────────
// useRouter no puede funcionar fuera del contexto de Next.js (árbol de la app),
// por lo que lo sustituimos por un objeto con un spy en push.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Las server actions acceden a la BD y a las cookies — las mockeamos para que
// los tests sean puramente unitarios y no tengan efectos secundarios.
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

// El tracker anónimo usa sessionStorage, que no existe en jsdom de la misma
// forma que en el navegador real, así que también lo mockeamos.
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// ─── Imports después de los vi.mock() ─────────────────────────────────────────
// Vitest eleva los vi.mock() al inicio del módulo, pero es buena práctica
// importar los módulos mockeados después de declararlos para dejar claro que
// son doubles de prueba, no las implementaciones reales.
import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Usamos datos de prueba consistentes para que los tests sean legibles
// sin depender de valores mágicos dispersos por el archivo.
const MOCK_PROJECT = {
  id: "proj-123",
  name: "Test Project",
  userId: "user-1",
  messages: "[]",
  data: "{}",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MOCK_PROJECTS_LIST = [
  { id: "proj-recent", name: "Recent Project", createdAt: new Date("2024-06-01"), updatedAt: new Date("2024-06-01") },
  { id: "proj-old", name: "Old Project", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01") },
];

// Simula trabajo previo del usuario cuando estaba sin autenticar.
const MOCK_ANON_WORK = {
  messages: [{ role: "user", content: "Build a login form" }],
  fileSystemData: { "/App.tsx": { content: "<form/>" } },
};

// ─── Suite principal ───────────────────────────────────────────────────────────
describe("useAuth", () => {
  beforeEach(() => {
    // Reseteamos todos los mocks para garantizar aislamiento entre tests.
    // Sin esto, una llamada de una prueba podría "contaminar" la siguiente.
    vi.clearAllMocks();

    // Estado por defecto: usuario sin trabajo anónimo y sin proyectos previos.
    // Cada describe puede sobreescribir esto según lo que necesite probar.
    vi.mocked(getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjects).mockResolvedValue([]);
    vi.mocked(createProject).mockResolvedValue(MOCK_PROJECT);
  });

  // ── Estado inicial del hook ──────────────────────────────────────────────────
  describe("estado inicial", () => {
    it("isLoading empieza en false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("expone la función signIn", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
    });

    it("expone la función signUp", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  // ── signIn ───────────────────────────────────────────────────────────────────
  describe("signIn", () => {
    // ── Argumentos y retorno ──
    describe("llamada a la action", () => {
      it("invoca signInAction con el email y password exactos", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: false, error: "error" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("usuario@test.com", "miPassword123");
        });

        // Verificamos que los argumentos se pasan sin modificar
        expect(signInAction).toHaveBeenCalledWith("usuario@test.com", "miPassword123");
        expect(signInAction).toHaveBeenCalledTimes(1);
      });

      it("retorna exactamente lo que devuelve la action cuando tiene éxito", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;

        await act(async () => {
          returnValue = await result.current.signIn("user@test.com", "pass");
        });

        expect(returnValue).toEqual({ success: true });
      });

      it("retorna exactamente lo que devuelve la action cuando falla", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: false, error: "Credenciales inválidas" });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;

        await act(async () => {
          returnValue = await result.current.signIn("bad@test.com", "wrong");
        });

        expect(returnValue).toEqual({ success: false, error: "Credenciales inválidas" });
      });
    });

    // ── Flujo post-login: sin trabajo anónimo ──
    describe("sin trabajo anónimo guardado", () => {
      beforeEach(() => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
      });

      it("redirige al primer proyecto (más reciente) si el usuario ya tiene proyectos", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        // getProjects devuelve los proyectos ordenados por fecha desc,
        // por lo que el índice 0 es siempre el más reciente.
        expect(mockPush).toHaveBeenCalledWith("/proj-recent");
        expect(mockPush).toHaveBeenCalledTimes(1);
      });

      it("no crea proyecto nuevo cuando ya hay proyectos existentes", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(createProject).not.toHaveBeenCalled();
      });

      it("crea un proyecto nuevo si el usuario no tiene ninguno y redirige a él", async () => {
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockResolvedValue({ ...MOCK_PROJECT, id: "new-proj-id" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        // El nuevo proyecto se crea con mensajes vacíos (usuario recién llegado)
        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/new-proj-id");
      });

      it("el nombre del proyecto nuevo sigue el patrón 'New Design #XXXXX'", async () => {
        vi.mocked(getProjects).mockResolvedValue([]);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ name: expect.stringMatching(/^New Design #\d+$/) })
        );
      });
    });

    // ── Flujo post-login: con trabajo anónimo ──
    describe("con trabajo anónimo guardado", () => {
      beforeEach(() => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(MOCK_ANON_WORK);
        vi.mocked(createProject).mockResolvedValue({ ...MOCK_PROJECT, id: "migrated-id" });
      });

      it("migra el trabajo anónimo a un nuevo proyecto", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from"),
          messages: MOCK_ANON_WORK.messages,
          data: MOCK_ANON_WORK.fileSystemData,
        });
      });

      it("limpia el trabajo anónimo del sessionStorage tras migrar", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        // Fundamental: si no se limpia, el próximo login volvería a migrar el mismo trabajo.
        expect(clearAnonWork).toHaveBeenCalledTimes(1);
      });

      it("redirige al proyecto recién creado con el trabajo migrado", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/migrated-id");
      });

      it("no consulta los proyectos existentes cuando hay trabajo anónimo que migrar", async () => {
        // Optimización: si ya sabemos qué hacer con el trabajo anónimo,
        // no tiene sentido hacer una llamada extra a getProjects.
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(getProjects).not.toHaveBeenCalled();
      });
    });

    // ── Edge case: trabajo anónimo sin mensajes ──
    describe("con trabajo anónimo vacío (messages: [])", () => {
      beforeEach(() => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        // Este edge case ocurre si el tracker se inicializó pero el usuario no envió nada.
        vi.mocked(getAnonWorkData).mockReturnValue({ messages: [], fileSystemData: {} });
      });

      it("no migra el trabajo anónimo si no hay mensajes", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        // messages.length === 0, por lo que entra al flujo normal
        expect(clearAnonWork).not.toHaveBeenCalled();
      });

      it("cae al flujo normal y consulta los proyectos existentes", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass");
        });

        expect(getProjects).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith("/proj-recent");
      });
    });

    // ── Autenticación fallida ──
    describe("cuando signInAction falla", () => {
      beforeEach(() => {
        vi.mocked(signInAction).mockResolvedValue({ success: false, error: "Error de auth" });
      });

      it("no redirige al usuario", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("bad@test.com", "wrong");
        });

        expect(mockPush).not.toHaveBeenCalled();
      });

      it("no consulta los proyectos del usuario", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("bad@test.com", "wrong");
        });

        expect(getProjects).not.toHaveBeenCalled();
      });

      it("no crea ningún proyecto", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("bad@test.com", "wrong");
        });

        expect(createProject).not.toHaveBeenCalled();
      });
    });

    // ── Errores en operaciones post-login ──
    describe("cuando getProjects lanza un error", () => {
      it("no traga el error silenciosamente — lo propaga al caller", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getProjects).mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await expect(result.current.signIn("user@test.com", "pass")).rejects.toThrow("DB error");
        });
      });

      it("restablece isLoading a false aunque getProjects falle", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getProjects).mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass").catch(() => {});
        });

        // El bloque finally del hook garantiza que isLoading siempre vuelve a false.
        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("cuando createProject lanza un error", () => {
      it("propaga el error al caller", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockRejectedValue(new Error("Project creation failed"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await expect(result.current.signIn("user@test.com", "pass")).rejects.toThrow(
            "Project creation failed"
          );
        });
      });
    });

    // ── Estado isLoading ──
    describe("gestión de isLoading", () => {
      it("pasa a true mientras signIn está en curso", async () => {
        // Usamos una promesa diferida para pausar la action y capturar el estado intermedio.
        let resolveSignIn!: (value: { success: boolean }) => void;
        vi.mocked(signInAction).mockReturnValue(
          new Promise((res) => { resolveSignIn = res; })
        );

        const { result } = renderHook(() => useAuth());
        expect(result.current.isLoading).toBe(false);

        // Lanzamos signIn sin esperar — la promesa queda pendiente
        act(() => { result.current.signIn("user@test.com", "pass"); });

        await waitFor(() => expect(result.current.isLoading).toBe(true));

        // Resolvemos para dejar terminar el hook limpiamente
        await act(async () => { resolveSignIn({ success: false }); });
      });

      it("vuelve a false cuando signIn termina con éxito", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useAuth());

        await act(async () => { await result.current.signIn("user@test.com", "pass"); });

        expect(result.current.isLoading).toBe(false);
      });

      it("vuelve a false cuando signIn termina con error de credenciales", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: false, error: "error" });

        const { result } = renderHook(() => useAuth());

        await act(async () => { await result.current.signIn("bad@test.com", "wrong"); });

        expect(result.current.isLoading).toBe(false);
      });

      it("vuelve a false incluso si signInAction lanza una excepción (bloque finally)", async () => {
        // El finally garantiza que la UI nunca queda bloqueada en estado de carga.
        vi.mocked(signInAction).mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@test.com", "pass").catch(() => {});
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  // ── signUp ───────────────────────────────────────────────────────────────────
  describe("signUp", () => {
    // ── Argumentos y retorno ──
    describe("llamada a la action", () => {
      it("invoca signUpAction con el email y password exactos", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "error" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("nuevo@test.com", "Password456!");
        });

        expect(signUpAction).toHaveBeenCalledWith("nuevo@test.com", "Password456!");
        expect(signUpAction).toHaveBeenCalledTimes(1);
      });

      it("retorna exactamente lo que devuelve la action cuando tiene éxito", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;

        await act(async () => {
          returnValue = await result.current.signUp("new@test.com", "pass");
        });

        expect(returnValue).toEqual({ success: true });
      });

      it("retorna exactamente lo que devuelve la action cuando falla", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "Email ya registrado" });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;

        await act(async () => {
          returnValue = await result.current.signUp("existing@test.com", "pass");
        });

        expect(returnValue).toEqual({ success: false, error: "Email ya registrado" });
      });
    });

    // ── Flujo post-registro: sin trabajo anónimo ──
    describe("sin trabajo anónimo guardado", () => {
      beforeEach(() => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
      });

      it("redirige al proyecto más reciente si ya había proyectos previos", async () => {
        // Puede ocurrir si el usuario ya existía y se está registrando de nuevo
        // en otro device — edge case poco frecuente pero posible.
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("user@test.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-recent");
        expect(mockPush).toHaveBeenCalledTimes(1);
      });

      it("crea un proyecto nuevo si no hay proyectos y redirige a él", async () => {
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockResolvedValue({ ...MOCK_PROJECT, id: "brand-new-id" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/brand-new-id");
      });

      it("el nombre del proyecto nuevo sigue el patrón 'New Design #XXXXX'", async () => {
        vi.mocked(getProjects).mockResolvedValue([]);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ name: expect.stringMatching(/^New Design #\d+$/) })
        );
      });
    });

    // ── Flujo post-registro: con trabajo anónimo ──
    describe("con trabajo anónimo guardado", () => {
      beforeEach(() => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(MOCK_ANON_WORK);
        vi.mocked(createProject).mockResolvedValue({ ...MOCK_PROJECT, id: "anon-migrated-id" });
      });

      it("migra el trabajo anónimo a un nuevo proyecto con sus mensajes y archivos", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from"),
          messages: MOCK_ANON_WORK.messages,
          data: MOCK_ANON_WORK.fileSystemData,
        });
      });

      it("limpia el sessionStorage del trabajo anónimo tras migrar", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(clearAnonWork).toHaveBeenCalledTimes(1);
      });

      it("redirige al proyecto con el trabajo migrado", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/anon-migrated-id");
      });

      it("no consulta getProjects cuando hay trabajo anónimo que migrar", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(getProjects).not.toHaveBeenCalled();
      });
    });

    // ── Edge case: trabajo anónimo sin mensajes ──
    describe("con trabajo anónimo vacío (messages: [])", () => {
      beforeEach(() => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue({ messages: [], fileSystemData: {} });
      });

      it("no migra el trabajo anónimo y cae al flujo normal", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(clearAnonWork).not.toHaveBeenCalled();
        expect(getProjects).toHaveBeenCalledTimes(1);
      });

      it("redirige al proyecto más reciente en el flujo normal", async () => {
        vi.mocked(getProjects).mockResolvedValue(MOCK_PROJECTS_LIST);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-recent");
      });
    });

    // ── Registro fallido ──
    describe("cuando signUpAction falla", () => {
      beforeEach(() => {
        vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "Error de registro" });
      });

      it("no redirige al usuario", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("existing@test.com", "pass");
        });

        expect(mockPush).not.toHaveBeenCalled();
      });

      it("no consulta los proyectos del usuario", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("existing@test.com", "pass");
        });

        expect(getProjects).not.toHaveBeenCalled();
      });

      it("no crea ningún proyecto", async () => {
        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("existing@test.com", "pass");
        });

        expect(createProject).not.toHaveBeenCalled();
      });
    });

    // ── Errores en operaciones post-registro ──
    describe("cuando createProject lanza un error durante signUp", () => {
      it("propaga el error al caller", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockRejectedValue(new Error("Storage full"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await expect(result.current.signUp("new@test.com", "pass")).rejects.toThrow("Storage full");
        });
      });
    });

    // ── Estado isLoading ──
    describe("gestión de isLoading", () => {
      it("pasa a true mientras signUp está en curso", async () => {
        let resolveSignUp!: (value: { success: boolean }) => void;
        vi.mocked(signUpAction).mockReturnValue(
          new Promise((res) => { resolveSignUp = res; })
        );

        const { result } = renderHook(() => useAuth());
        expect(result.current.isLoading).toBe(false);

        act(() => { result.current.signUp("new@test.com", "pass"); });

        await waitFor(() => expect(result.current.isLoading).toBe(true));

        await act(async () => { resolveSignUp({ success: false }); });
      });

      it("vuelve a false cuando signUp termina con éxito", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useAuth());

        await act(async () => { await result.current.signUp("new@test.com", "pass"); });

        expect(result.current.isLoading).toBe(false);
      });

      it("vuelve a false cuando signUp termina con error de registro", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "error" });

        const { result } = renderHook(() => useAuth());

        await act(async () => { await result.current.signUp("existing@test.com", "pass"); });

        expect(result.current.isLoading).toBe(false);
      });

      it("vuelve a false incluso si signUpAction lanza una excepción (bloque finally)", async () => {
        vi.mocked(signUpAction).mockRejectedValue(new Error("Server crash"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass").catch(() => {});
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("vuelve a false si createProject falla durante signUp", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@test.com", "pass").catch(() => {});
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  // ── Aislamiento entre instancias del hook ────────────────────────────────────
  describe("aislamiento entre instancias", () => {
    it("dos instancias del hook tienen su propio estado isLoading independiente", async () => {
      // Importante verificar que el estado no se comparte entre componentes distintos
      // que usen el hook al mismo tiempo.
      let resolveFirst!: (value: { success: boolean }) => void;
      vi.mocked(signInAction)
        .mockReturnValueOnce(new Promise((res) => { resolveFirst = res; }))
        .mockResolvedValueOnce({ success: false, error: "error" });

      const { result: hook1 } = renderHook(() => useAuth());
      const { result: hook2 } = renderHook(() => useAuth());

      // Solo hook1 tiene una operación en curso
      act(() => { hook1.current.signIn("user1@test.com", "pass"); });

      await waitFor(() => expect(hook1.current.isLoading).toBe(true));

      // hook2 no debe verse afectado por la operación de hook1
      expect(hook2.current.isLoading).toBe(false);

      await act(async () => { resolveFirst({ success: false }); });
    });
  });
});
