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
import { LlmConfigService } from './llm-config.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createLlmConfigSchema,
  updateLlmConfigSchema,
  updateAssignmentsSchema,
} from './dto/llm-config.dto';

@ApiTags('LLM Configs')
@ApiBearerAuth()
@Controller('llm-configs')
export class LlmConfigController {
  constructor(private readonly service: LlmConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Add LLM configuration' })
  create(@Body(new ZodValidationPipe(createLlmConfigSchema)) dto: any) {
    return this.service.createLlmConfig(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List LLM configurations' })
  findAll(@Query() query: any) {
    return this.service.findAllLlmConfigs(query);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update LLM configuration' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLlmConfigSchema)) dto: any,
  ) {
    return this.service.updateLlmConfig(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete LLM configuration' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLlmConfig(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test LLM connectivity' })
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.testLlmConfig(id);
  }
}

@ApiTags('LLM Assignments')
@ApiBearerAuth()
@Controller('llm-assignments')
export class LlmAssignmentController {
  constructor(private readonly service: LlmConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get model usage assignments' })
  getAssignments() {
    return this.service.getAssignments();
  }

  @Put()
  @ApiOperation({ summary: 'Update model usage assignments' })
  updateAssignments(@Body(new ZodValidationPipe(updateAssignmentsSchema)) dto: any) {
    return this.service.updateAssignments(dto);
  }
}
