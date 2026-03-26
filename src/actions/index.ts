"use server";

import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession, getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface AuthResult {
  success: boolean;
  error?: string;
}

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    // Validate input
    if (!email || !password) {
      return { success: false, error: "El correo y la contraseña son obligatorios" };
    }

    if (password.length < 8) {
      return {
        success: false,
        error: "La contraseña debe tener al menos 8 caracteres",
      };
    }

    // Comprobar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "Este correo ya está registrado" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // Create session
    await createSession(user.id, user.email);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Sign up error:", error);
    return { success: false, error: "Ocurrió un error al crear la cuenta" };
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    // Validate input
    if (!email || !password) {
      return { success: false, error: "El correo y la contraseña son obligatorios" };
    }

    // Buscar el usuario por correo
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: "Credenciales incorrectas" };
    }

    // Verificar la contraseña comparando con el hash almacenado
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return { success: false, error: "Credenciales incorrectas" };
    }

    // Create session
    await createSession(user.id, user.email);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Sign in error:", error);
    return { success: false, error: "Ocurrió un error al iniciar sesión" };
  }
}

export async function signOut() {
  await deleteSession();
  revalidatePath("/");
  redirect("/");
}

export async function getUser() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    console.error("Get user error:", error);
    return null;
  }
}
