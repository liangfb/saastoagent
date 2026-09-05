import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createPolicySchema, updatePolicySchema } from './dto/policy.dto';
import { PoliciesService } from './policies.service';

@ApiTags('Policies')
@ApiBearerAuth()
@Controller('policies')
export class PoliciesController {
  constructor(private readonly service: PoliciesService) {}

  @Post()
  @ApiOperation({ summary: 'Create tool policy' })
  create(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(createPolicySchema)) dto: any,
  ) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List tool policies' })
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tool policy' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tool policy' })
  update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePolicySchema)) dto: any,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tool policy' })
  remove(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, userId);
  }
}
