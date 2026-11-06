import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { indianMobile, parse } from '../../common/http';
import { ForModule, TenantScoped } from '../../core/tenancy/tenant.guard';
import { MODULE_ID, TokenService } from './token.service';

const CreateQueueSchema = z.object({
  name: z.string().min(1).max(60),
  prefix: z.string().regex(/^[A-Z]{1,3}$/, '1-3 capital letters').default('A'),
  averageServiceMinutes: z.number().int().min(1).max(180).default(15),
  branchId: z.string().uuid().optional(),
});
const UpdateQueueSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  averageServiceMinutes: z.number().int().min(1).max(180).optional(),
});
const IssueSchema = z.object({
  customerName: z.string().trim().min(1).max(80).optional(),
  customerPhone: indianMobile.optional(),
  partySize: z.number().int().min(1).max(50).optional(),
  priority: z.boolean().default(false),
});
const StatusSchema = z.object({ status: z.enum(['COMPLETED', 'SKIPPED', 'CANCELLED']) });
const ReportQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Staff endpoints (spec 10 "Queue"). Tenant comes from the X-Xeva-Tenant header. */
@Controller()
@ForModule(MODULE_ID)
export class TokenController {
  constructor(private readonly tokens: TokenService) {}

  @Get('queues')
  @TenantScoped('tokens.view')
  list(@Tenant() ctx: TenantContext) {
    return this.tokens.listQueues(ctx);
  }

  @Post('queues')
  @TenantScoped('tokens.manage')
  create(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    return this.tokens.createQueue(ctx, parse(CreateQueueSchema, body));
  }

  @Patch('queues/:queueId')
  @TenantScoped('tokens.manage')
  update(@Tenant() ctx: TenantContext, @Param('queueId', ParseUUIDPipe) queueId: string, @Body() body: unknown) {
    return this.tokens.updateQueue(ctx, queueId, parse(UpdateQueueSchema, body));
  }

  @Get('queues/:queueId/board')
  @TenantScoped('tokens.view')
  board(@Tenant() ctx: TenantContext, @Param('queueId', ParseUUIDPipe) queueId: string) {
    return this.tokens.board(ctx, queueId);
  }

  @Get('queues/:queueId/report')
  @TenantScoped('tokens.view')
  report(@Tenant() ctx: TenantContext, @Param('queueId', ParseUUIDPipe) queueId: string, @Query() query: unknown) {
    return this.tokens.report(ctx, queueId, parse(ReportQuery, query).date);
  }

  @Post('queues/:queueId/tokens')
  @TenantScoped('tokens.manage')
  issue(@Tenant() ctx: TenantContext, @Param('queueId', ParseUUIDPipe) queueId: string, @Body() body: unknown) {
    return this.tokens.issueWalkIn(ctx, queueId, parse(IssueSchema, body));
  }

  @Post('queues/:queueId/call-next')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('tokens.manage')
  callNext(@Tenant() ctx: TenantContext, @Param('queueId', ParseUUIDPipe) queueId: string) {
    return this.tokens.callNext(ctx, queueId);
  }

  /** Call a specific token: also used to re-announce a called token or recall a skipped one. */
  @Post('tokens/:tokenId/call')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('tokens.manage')
  call(@Tenant() ctx: TenantContext, @Param('tokenId', ParseUUIDPipe) tokenId: string) {
    return this.tokens.call(ctx, tokenId);
  }

  @Patch('tokens/:tokenId/status')
  @TenantScoped('tokens.manage')
  setStatus(@Tenant() ctx: TenantContext, @Param('tokenId', ParseUUIDPipe) tokenId: string, @Body() body: unknown) {
    return this.tokens.setStatus(ctx, tokenId, parse(StatusSchema, body).status);
  }
}
