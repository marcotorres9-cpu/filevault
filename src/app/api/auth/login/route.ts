import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createToken } from '@/lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Usuario y contraseña son requeridos.' },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;

    const user = await db.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const token = await createToken({ userId: user.id, username: user.username });

    const response = NextResponse.json({
      user: { id: user.id, username: user.username },
      token,
      message: 'Inicio de sesión exitoso.',
    });

    // Cookie settings: lax works in WebView + cross-origin. secure only in production.
    // This is the fix for "login no funciona bien para descargar/eliminar":
    // sameSite=none+secure=true was being silently dropped by WebView on HTTP/preview URLs.
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    };

    // HttpOnly cookie for server-side auth (download, delete)
    response.cookies.set('token', token, cookieOpts);
    // Non-httpOnly copy so the client can read it for Bearer header / query param
    response.cookies.set('fv_token', token, { ...cookieOpts, httpOnly: false });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}