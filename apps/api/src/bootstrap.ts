import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Shared app configuration for the server and e2e tests. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Number of reverse proxies in front of the API (nginx = 1, caddy + nginx = 2).
  express.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '5mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const findMsg = (e: typeof first): string | undefined =>
          e?.constraints ? Object.values(e.constraints)[0] : e?.children?.length ? findMsg(e.children[0]) : undefined;
        return new BadRequestException(findMsg(first) ?? 'Check the highlighted fields.');
      },
    }),
  );
  return app;
}
