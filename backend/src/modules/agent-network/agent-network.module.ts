import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentNetworkController } from './agent-network.controller';
import { AgentNetworkService } from './agent-network.service';
import { MemoryService } from './memory/memory.service';
import { McpClientService } from './mcp-client/mcp-client.service';
import { McpToolRegistrar } from './mcp-client/mcp-tool-registrar';

@Module({
  imports: [HttpModule],
  controllers: [AgentNetworkController],
  providers: [AgentNetworkService, MemoryService, McpClientService, McpToolRegistrar],
  exports: [AgentNetworkService, MemoryService, McpClientService, McpToolRegistrar],
})
export class AgentNetworkModule {}
