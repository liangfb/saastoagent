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
import { AgentNetworkService } from './agent-network.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  createAgentSchema,
  updateAgentSchema,
  bindMcpSchema,
  setMcpBindingsSchema,
} from './dto/agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentNetworkController {
  constructor(private readonly service: AgentNetworkService) {}

  @Post()
  @ApiOperation({ summary: 'Create Agent' })
  create(@Body(new ZodValidationPipe(createAgentSchema)) dto: any) {
    return this.service.createAgent(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Agents' })
  findAll(@Query() query: any) {
    return this.service.findAllAgents(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Agent details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findAgentById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update Agent' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) dto: any,
  ) {
    return this.service.updateAgent(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete Agent' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAgent(id);
  }

  @Post(':id/mcp-bindings')
  @ApiOperation({ summary: 'Bind a single MCP tool to Agent' })
  bindMcp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(bindMcpSchema)) dto: any,
  ) {
    return this.service.bindMcp(id, dto);
  }

  @Put(':id/mcp-bindings')
  @ApiOperation({ summary: 'Replace the full set of MCP tool bindings for Agent' })
  setMcpBindings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setMcpBindingsSchema)) dto: any,
  ) {
    return this.service.setMcpBindings(id, dto);
  }

  @Delete(':id/mcp-bindings/:bindingId')
  @ApiOperation({ summary: 'Unbind MCP tool from Agent' })
  unbindMcp(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
  ) {
    return this.service.unbindMcp(id, bindingId);
  }
}
