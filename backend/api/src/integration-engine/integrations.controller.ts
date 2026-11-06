import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Tenant, TenantContext } from '../common/context';
import { parse } from '../common/http';
import { TenantScoped } from '../core/tenancy/tenant.guard';
import { IntegrationsService } from './integrations.service';

const CreateSchema = z.object({
  sourceModule: z.string().min(1),
  destinationModule: z.string().min(1),
  type: z.enum(['AUTOMATIC', 'CONFIGURABLE', 'EXTERNAL']).default('AUTOMATIC'),
  config: z.record(z.unknown()).default({}),
  allowedEvents: z.array(z.string()).optional(),
});

const UpdateSchema = z
  .object({ config: z.record(z.unknown()).optional(), allowedEvents: z.array(z.string()).optional() })
  .refine((v) => v.config || v.allowedEvents, 'Provide config or allowedEvents');

const StatusQuery = z.object({ status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']).optional() });

/** Tenant is selected with the X-Xeva-Tenant header (spec 10 endpoints). */
@Controller()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('integrations')
  @TenantScoped('integrations.view')
  list(@Tenant() ctx: TenantContext) {
    return this.integrations.list(ctx);
  }

  @Post('integrations')
  @TenantScoped('integrations.configure')
  create(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    return this.integrations.create(ctx, parse(CreateSchema, body));
  }

  @Patch('integrations/:integrationId')
  @TenantScoped('integrations.configure')
  update(@Tenant() ctx: TenantContext, @Param('integrationId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.integrations.update(ctx, id, parse(UpdateSchema, body));
  }

  @Post('integrations/:integrationId/test')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('integrations.view')
  test(@Tenant() ctx: TenantContext, @Param('integrationId', ParseUUIDPipe) id: string) {
    return this.integrations.test(ctx, id);
  }

  @Post('integrations/:integrationId/enable')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('integrations.configure')
  enable(@Tenant() ctx: TenantContext, @Param('integrationId', ParseUUIDPipe) id: string) {
    return this.integrations.setStatus(ctx, id, 'ACTIVE');
  }

  @Post('integrations/:integrationId/disable')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('integrations.configure')
  disable(@Tenant() ctx: TenantContext, @Param('integrationId', ParseUUIDPipe) id: string) {
    return this.integrations.setStatus(ctx, id, 'DISABLED');
  }

  @Get('integrations/:integrationId/events')
  @TenantScoped('integrations.view')
  events(@Tenant() ctx: TenantContext, @Param('integrationId', ParseUUIDPipe) id: string, @Query() query: unknown) {
    return this.integrations.events(ctx, id, parse(StatusQuery, query).status);
  }

  /** Integration health: every delivery for the tenant, filterable (e.g. ?status=DEAD_LETTER). */
  @Get('integration-events')
  @TenantScoped('integrations.view')
  deliveries(@Tenant() ctx: TenantContext, @Query() query: unknown) {
    return this.integrations.listDeliveries(ctx, parse(StatusQuery, query).status);
  }

  @Post('integration-events/:deliveryId/replay')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('integrations.configure')
  replay(@Tenant() ctx: TenantContext, @Param('deliveryId', ParseUUIDPipe) id: string) {
    return this.integrations.replay(ctx, id);
  }
}
