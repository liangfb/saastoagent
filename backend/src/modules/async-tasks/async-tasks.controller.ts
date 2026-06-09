import { Controller, Get, Post, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AsyncTasksService } from './async-tasks.service';

@ApiTags('Async Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class AsyncTasksController {
  constructor(private readonly service: AsyncTasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks (filter by type/status)' })
  findAll(@Query() query: any) {
    return this.service.findAllTasks(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details (status + progress)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findTaskById(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel task' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelTask(id);
  }
}
