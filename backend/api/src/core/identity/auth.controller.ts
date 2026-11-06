import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload, Public } from './auth.guards';

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// Constant-time-ish path for unknown emails so response timing doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * Employee / owner / Xeva admin login (spec 11.1).
 * Phase 0 uses email + password with signed JWTs; customer OTP login and an external
 * OIDC provider plug in behind this same controller in later phases.
 */
@Controller()
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const { email, password } = parse(LoginSchema, body);
    // platform_users is not tenant-scoped, so no RLS context is needed for this lookup.
    const user = await this.prisma.platformUser.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const payload: JwtPayload = { sub: user.id, adm: user.isPlatformAdmin };
    return { accessToken: await this.jwt.signAsync(payload), tokenType: 'Bearer' };
  }

  /** The signed-in user and the restaurants they work for. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.prisma.platformUser.findUniqueOrThrow({
      where: { id: user.userId },
      select: { id: true, email: true, fullName: true, isPlatformAdmin: true },
    });
    const memberships = await this.prisma.withUser(user.userId, (tx) =>
      tx.employee.findMany({
        where: { platformUserId: user.userId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, tenantId: true, displayName: true, tenant: { select: { name: true, slug: true } } },
      }),
    );
    return {
      ...profile,
      memberships: memberships.map((m) => ({
        employeeId: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        displayName: m.displayName,
      })),
    };
  }
}
