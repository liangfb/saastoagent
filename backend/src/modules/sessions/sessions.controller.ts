import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Sse,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { SessionsService } from './sessions.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { Public } from '../../core/decorators/public.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { createSessionSchema } from './dto/session.dto';

// All routes are protected by the global JwtAuthGuard except the SSE stream
// (opted out with @Public()), since EventSource cannot send an Authorization
// header.
@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create session' })
  create(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(createSessionSchema)) dto: any,
  ) {
    return this.service.createSession({ ...dto, userId });
  }

  @Get()
  @ApiOperation({ summary: 'List sessions' })
  findAll(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.service.findAllSessions(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details (with message history)' })
  findOne(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findSessionById(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete session' })
  remove(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSession(id, userId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send message (triggers Agent execution)' })
  sendMessage(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.sendMessage(id, dto, userId);
  }

  // SSE stream: opened via native EventSource which cannot send an
  // Authorization header, so it opts out of the global guard. It only emits
  // read-only trace events for a session id the client already holds.
  @Public()
  @Sse(':id/stream')
  @ApiOperation({ summary: 'Agent response stream (SSE)' })
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.service.streamEvents(id).pipe(
      map(
        (event) =>
          ({
            type: event.type,
            data: event.data,
          }) as unknown as MessageEvent,
      ),
    );
  }
}
