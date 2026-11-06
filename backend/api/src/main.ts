import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(config.port);
  Logger.log(`Xeva API listening on http://localhost:${config.port}/api/v1`, 'Bootstrap');
}

void bootstrap();
