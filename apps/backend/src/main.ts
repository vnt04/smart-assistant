import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.NODE_ENV === "production" ? false : true,
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = Number(process.env.BACKEND_PORT ?? 3000);
  await app.listen(port, "0.0.0.0");

  const logger = app.get(Logger);
  logger.log(`API ready → http://localhost:${port}/api/health`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
