import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { User, UserRole } from './modules/users/entities/user.entity';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost')
    .split(',').map(o => o.trim());

  app.enableCors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, same-origin via nginx)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('IT Inventory API')
    .setDescription('API системы учёта основных средств')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // Seed default admin user
  try {
    const userRepo = app.get(getRepositoryToken(User));
    const adminUsername = process.env.ADMIN_USERNAME || 'r.zhuman';
    const existing = await userRepo.findOne({ where: { username: adminUsername } });
    if (!existing) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'Ktms2026!';
      await userRepo.save(userRepo.create({
        username: adminUsername,
        email: process.env.ADMIN_EMAIL || 'admin@ktms.kz',
        passwordHash: await bcrypt.hash(adminPassword, 12),
        fullName: 'Администратор',
        role: UserRole.ADMIN,
        isActive: true,
      }));
      console.log(`Admin user '${adminUsername}' created`);
    }
  } catch (e) {
    console.error('Seed error:', e.message);
  }

  await app.listen(process.env.PORT || 3001);
  console.log(`Backend running on port ${process.env.PORT || 3001}`);
}

bootstrap();
