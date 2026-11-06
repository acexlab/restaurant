import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { hasPermission, MODULE_STATUSES } from '@xeva/contracts';
import { z } from 'zod';
import { Tenant, TenantContext } from '../common/context';
import { parse } from '../common/http';
import { TenantScoped } from '../core/tenancy/tenant.guard';
import { ModuleRegistryService } from './module-registry.service';
import { NAVIGATION } from './navigation';

const ActivateSchema = z.object({ moduleId: z.string().min(1) });
const PatchSchema = z
  .object({
    status: z.enum(MODULE_STATUSES).optional(),
    features: z.record(z.boolean()).optional(),
  })
  .refine((v) => v.status || v.features, 'Provide status or features');

@Controller()
export class ModuleRegistryController {
  constructor(private readonly registry: ModuleRegistryService) {}

  /** Product catalogue (any signed-in user). */
  @Get('modules')
  catalog() {
    return this.registry.catalog();
  }

  @Get('tenants/:tenantId/modules')
  @TenantScoped('modules.view')
  installed(@Tenant() ctx: TenantContext) {
    return this.registry.installed(ctx);
  }

  @Post('tenants/:tenantId/modules')
  @TenantScoped('modules.manage')
  activate(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    return this.registry.activate(ctx, parse(ActivateSchema, body).moduleId);
  }

  @Patch('tenants/:tenantId/modules/:moduleId')
  @TenantScoped('modules.manage')
  async update(@Tenant() ctx: TenantContext, @Param('moduleId') moduleId: string, @Body() body: unknown) {
    const input = parse(PatchSchema, body);
    const result: Record<string, unknown> = { moduleId };
    if (input.status) result.installation = await this.registry.changeStatus(ctx, moduleId, input.status);
    if (input.features) result.features = (await this.registry.setFeatures(ctx, moduleId, input.features)).features;
    return result;
  }

  /** Admin navigation generated from active modules + the user's permissions (spec 4.2). */
  @Get('me/navigation')
  @TenantScoped()
  async navigation(@Tenant() ctx: TenantContext) {
    const active = new Set(await this.registry.activeModuleIds(ctx));
    return NAVIGATION.filter(
      (item) =>
        (!item.moduleId || active.has(item.moduleId)) &&
        (!item.permission || hasPermission(ctx.permissions, item.permission)),
    ).map(({ key, label, path }) => ({ key, label, path }));
  }
}
