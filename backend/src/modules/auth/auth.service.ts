import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { verifyPassword } from '../../core/utils/password.util';
import { LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    // Verify even when the user is missing to avoid leaking which usernames
    // exist via response timing.
    const stored = user?.passwordHash ?? 'scrypt$16384$00$00';
    const ok = verifyPassword(dto.password, stored);

    if (!user || !ok) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });

    return { token, username: user.username };
  }
}
