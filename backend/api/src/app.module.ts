import { INestApplication, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { CorrelationIdMiddleware, ErrorFilter } from './common/http';
import { config } from './config';
import { AuditController } from './core/audit/audit.controller';
import { AuditService } from './core/audit/audit.service';
import { EmployeesController } from './core/employees/employees.controller';
import { PlatformController } from './core/platform/platform.controller';
import { AuthController } from './core/identity/auth.controller';
import { JwtAuthGuard } from './core/identity/auth.guards';
import { TenantGuard } from './core/tenancy/tenant.guard';
import { TenantsController } from './core/tenants/tenants.controller';
import { HealthController } from './health.controller';
import { EventDispatcher } from './integration-engine/event-dispatcher.service';
import { IntegrationsController } from './integration-engine/integrations.controller';
import { IntegrationsService } from './integration-engine/integrations.service';
import { OutboxService } from './integration-engine/outbox.service';
import { ModuleRegistryController } from './module-registry/module-registry.controller';
import { ModuleRegistryService } from './module-registry/module-registry.service';
import { PrismaModule } from './prisma/prisma.module';
import { PublicTokenController } from './modules/digital-token/public.controller';
import { TokenController } from './modules/digital-token/token.controller';
import { TokenService } from './modules/digital-token/token.service';

/**
 * Modular monolith (spec 3): one deployable, with core services, the module registry and the
 * integration engine kept as separate domains. Product modules (Phase 1) register here as
 * their own Nest modules and talk to each other only through events and documented APIs.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ global: true, secret: config.jwtSecret, signOptions: { expiresIn: config.jwtTtlSeconds } }),
  ],
  controllers: [
    HealthController,
    AuthController,
    TenantsController,
    ModuleRegistryController,
    IntegrationsController,
    AuditController,
    EmployeesController,
    PlatformController,
    // Product modules
    TokenController,
    PublicTokenController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    TenantGuard,
    AuditService,
    OutboxService,
    EventDispatcher,
    IntegrationsService,
    ModuleRegistryService,
    TokenService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
