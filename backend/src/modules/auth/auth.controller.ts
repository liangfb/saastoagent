import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { Public } from '../../core/decorators/public.decorator';
import { loginSchema, LoginDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate with username and password' })
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.service.login(dto);
  }
}
