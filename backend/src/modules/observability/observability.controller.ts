import { Controller, Get, Post, Param, Body, Query, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { ObservabilityService } from './observability.service';

@ApiTags('Logs')
@ApiBearerAuth()
@Controller('logs')
export class LogsController {
  constructor(private readonly service: ObservabilityService) {}

  @Get()
  @ApiOperation({ summary: 'List logs (paginated + filters)' })
  findAll(@Query() query: any) {
    return this.service.findAllLogs(query);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Real-time log stream (SSE)' })
  stream(): Observable<MessageEvent> {
    // Phase 3: SSE log stream implementation
    return new Observable();
  }
}

@ApiTags('Traces')
@ApiBearerAuth()
@Controller('traces')
export class TracesController {
  constructor(private readonly service: ObservabilityService) {}

  @Get()
  @ApiOperation({ summary: 'List Agent traces (proxy Langfuse)' })
  findAll(@Query() query: any) {
    return this.service.findAllTraces(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trace details' })
  findOne(@Param('id') id: string) {
    return this.service.findTraceById(id);
  }

  @Post(':id/annotate')
  @ApiOperation({ summary: 'Annotate trace (correct/incorrect/needs improvement)' })
  annotate(@Param('id') id: string, @Body() dto: any) {
    return this.service.annotateTrace(id, dto);
  }
}
