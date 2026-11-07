import { Body, Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { TenantScoped } from '../tenancy/tenant.guard';

const paise = z.number().int().min(0).max(10_000_000);
const CategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  nameMl: z.string().trim().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});
const OptionSchema = z.object({ name: z.string().trim().min(1).max(40), pricePaise: paise });
const ItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  nameMl: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  pricePaise: paise,
  /** GST rates used by restaurants in India: 0, 5, 12, 18 %. */
  taxRateBps: z.union([z.literal(0), z.literal(500), z.literal(1200), z.literal(1800)]).default(500),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  imageUrl: z.string().url().max(500).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Replace the full list when provided. */
  variants: z.array(OptionSchema).max(10).optional(),
  addons: z.array(OptionSchema).max(20).optional(),
});

const include = { variants: true, addons: true } as const;

/** Shared menu & catalogue service (spec 3, 9.3). Used by QR Menu, Ordering, Waiter and POS. */
@Controller('menu')
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @TenantScoped('menu.view')
  menu(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.menuCategory.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { items: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include } },
      }),
    );
  }

  @Post('categories')
  @TenantScoped('menu.modify')
  createCategory(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(CategorySchema, body);
    return this.prisma.withTenant(ctx, (tx) => tx.menuCategory.create({ data: { tenantId: ctx.tenantId, ...input } }));
  }

  @Patch('categories/:categoryId')
  @TenantScoped('menu.modify')
  updateCategory(@Tenant() ctx: TenantContext, @Param('categoryId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(CategorySchema.partial(), body);
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.category(tx, ctx.tenantId, id);
      return tx.menuCategory.update({ where: { id }, data: input });
    });
  }

  @Post('items')
  @TenantScoped('menu.modify')
  createItem(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const { variants, addons, ...input } = parse(ItemSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.category(tx, ctx.tenantId, input.categoryId);
      return tx.menuItem.create({
        data: {
          tenantId: ctx.tenantId,
          ...input,
          variants: { create: (variants ?? []).map((v) => ({ ...v, tenantId: ctx.tenantId })) },
          addons: { create: (addons ?? []).map((a) => ({ ...a, tenantId: ctx.tenantId })) },
        },
        include,
      });
    });
  }

  /** Edits affect future orders only: placed orders keep their own name/price snapshot. */
  @Patch('items/:itemId')
  @TenantScoped('menu.modify')
  updateItem(@Tenant() ctx: TenantContext, @Param('itemId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { variants, addons, ...input } = parse(ItemSchema.partial(), body);
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.item(tx, ctx.tenantId, id);
      if (input.categoryId) await this.category(tx, ctx.tenantId, input.categoryId);
      if (variants) {
        await tx.menuVariant.deleteMany({ where: { itemId: id } });
        await tx.menuVariant.createMany({ data: variants.map((v) => ({ ...v, itemId: id, tenantId: ctx.tenantId })) });
      }
      if (addons) {
        await tx.menuAddon.deleteMany({ where: { itemId: id } });
        await tx.menuAddon.createMany({ data: addons.map((a) => ({ ...a, itemId: id, tenantId: ctx.tenantId })) });
      }
      return tx.menuItem.update({ where: { id }, data: input, include });
    });
  }

  @Delete('items/:itemId')
  @TenantScoped('menu.modify')
  removeItem(@Tenant() ctx: TenantContext, @Param('itemId', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.item(tx, ctx.tenantId, id);
      return tx.menuItem.update({ where: { id }, data: { deletedAt: new Date(), isAvailable: false } });
    });
  }

  private async category(tx: Tx, tenantId: string, id: string) {
    const c = await tx.menuCategory.findFirst({ where: { id, tenantId } });
    if (!c) throw httpError(HttpStatus.NOT_FOUND, 'CATEGORY_NOT_FOUND', 'Category not found');
    return c;
  }

  private async item(tx: Tx, tenantId: string, id: string) {
    const i = await tx.menuItem.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!i) throw httpError(HttpStatus.NOT_FOUND, 'ITEM_NOT_FOUND', 'Menu item not found');
    return i;
  }
}
