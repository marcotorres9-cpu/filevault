import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createToken } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Usuario debe tener 3-30 caracteres alfanuméricos. Contraseña mínimo 6 caracteres.' },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: 'El nombre de usuario ya está en uso.' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: { username, password: hashedPassword },
    });

    const token = await createToken({ userId: user.id, username: user.username });

    const response = NextResponse.json({
      user: { id: user.id, username: user.username },
      token,
      message: 'Cuenta creada exitosamente.',
    });

    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    };

    response.cookies.set('token', token, cookieOpts);
    response.cookies.set('fv_token', token, { ...cookieOpts, httpOnly: false });

    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}