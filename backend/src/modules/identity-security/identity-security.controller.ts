import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IdentitySecurityService } from './identity-security.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createCredentialSchema, updateCredentialSchema } from './dto/credential.dto';

@ApiTags('Credentials')
@ApiBearerAuth()
@Controller('credentials')
export class IdentitySecurityController {
  constructor(private readonly service: IdentitySecurityService) {}

  @Post()
  @ApiOperation({ summary: 'Create credential' })
  create(@Body(new ZodValidationPipe(createCredentialSchema)) dto: any) {
    return this.service.createCredential(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List credentials (masked)' })
  findAll(@Query() query: any) {
    return this.service.findAllCredentials(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get credential details (masked)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findCredentialById(id);
  }

  @Get(':id/reveal')
  @ApiOperation({ summary: 'Get credential details with unmasked config' })
  reveal(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.revealCredential(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update credential' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCredentialSchema)) dto: any,
  ) {
    return this.service.updateCredential(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete credential' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCredential(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test credential connectivity' })
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.testCredential(id);
  }
}
