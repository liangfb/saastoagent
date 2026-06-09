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
import { SemanticEngineService } from './semantic-engine.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createOpenapiSourceSchema, updateOpenapiSourceSchema } from './dto/openapi-source.dto';

@ApiTags('OpenAPI Sources')
@ApiBearerAuth()
@Controller('openapi-sources')
export class OpenapiSourceController {
  constructor(private readonly service: SemanticEngineService) {}

  @Post()
  @ApiOperation({ summary: 'Add OpenAPI data source' })
  create(@Body(new ZodValidationPipe(createOpenapiSourceSchema)) dto: any) {
    return this.service.createOpenapiSource(dto);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Fetch and return a Swagger/OpenAPI document from a URL' })
  preview(@Body() body: { sourceUrl?: string }) {
    return this.service.previewOpenapiSource(body?.sourceUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List data sources' })
  findAll(@Query() query: any) {
    return this.service.findAllOpenapiSources(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get data source details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOpenapiSourceById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update data source' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOpenapiSourceSchema)) dto: any,
  ) {
    return this.service.updateOpenapiSource(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete data source' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteOpenapiSource(id);
  }

  @Post(':id/parse')
  @ApiOperation({ summary: 'Trigger OpenAPI parsing (async)' })
  parse(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.parseOpenapiSource(id);
  }

  @Post(':id/regenerate')
  @ApiOperation({ summary: 'Re-run the full pipeline (parse → enhance → generate MCP)' })
  regenerate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.parseOpenapiSource(id);
  }

  @Get(':id/endpoints')
  @ApiOperation({ summary: 'List parsed endpoints' })
  getEndpoints(@Param('id', ParseUUIDPipe) id: string, @Query() query: any) {
    return this.service.getEndpoints(id, query);
  }

  @Post(':id/enhance')
  @ApiOperation({ summary: 'Batch semantic enhancement (async)' })
  enhance(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.enhanceSource(id);
  }

  @Post(':id/generate-mcp')
  @ApiOperation({ summary: 'Generate MCP Server (async)' })
  generateMcp(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.generateMcp(id);
  }
}

@ApiTags('Endpoints')
@ApiBearerAuth()
@Controller('endpoints')
export class EndpointController {
  constructor(private readonly service: SemanticEngineService) {}

  @Post(':id/enhance')
  @ApiOperation({ summary: 'Single endpoint enhancement' })
  enhance(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.enhanceEndpoint(id);
  }

  @Get(':id/semantic')
  @ApiOperation({ summary: 'Get semantic description' })
  getSemantic(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSemanticDescription(id);
  }

  @Put(':id/semantic')
  @ApiOperation({ summary: 'Edit semantic description' })
  updateSemantic(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.service.updateSemanticDescription(id, dto);
  }

  @Post(':id/semantic/approve')
  @ApiOperation({ summary: 'Approve semantic description' })
  approveSemantic(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveSemanticDescription(id);
  }
}

@ApiTags('MCP Servers')
@ApiBearerAuth()
@Controller('mcp-servers')
export class McpServerController {
  constructor(private readonly service: SemanticEngineService) {}

  @Get()
  @ApiOperation({ summary: 'List MCP Servers' })
  findAll(@Query() query: any) {
    return this.service.findAllMcpServers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get MCP Server details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findMcpServerById(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start MCP Server' })
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.startMcpServer(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop MCP Server' })
  stop(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.stopMcpServer(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Fetch last 200 lines of MCP Server pod logs' })
  logs(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getMcpServerLogs(id);
  }

  @Get(':id/tools')
  @ApiOperation({ summary: 'List MCP tools' })
  getTools(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getMcpServerTools(id);
  }
}
