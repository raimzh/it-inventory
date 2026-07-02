import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { User, UserRole } from './modules/users/entities/user.entity';
import { Department } from './modules/departments/entities/department.entity';

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

  // Seed / reset default admin user
  try {
    const userRepo = app.get(getRepositoryToken(User));
    const adminUsername = process.env.ADMIN_USERNAME || 'r.zhuman';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Ktms2026!';
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const existing = await userRepo.findOne({ where: { username: adminUsername } });
    if (existing) {
      // Force-update password to ensure it's hashed with current bcrypt
      await userRepo.update(existing.id, { passwordHash, isActive: true, role: UserRole.ADMIN });
      console.log(`Admin user '${adminUsername}' password updated`);
    } else {
      await userRepo.save(userRepo.create({
        username: adminUsername,
        email: process.env.ADMIN_EMAIL || 'admin@ktms.kz',
        passwordHash,
        fullName: 'Администратор',
        role: UserRole.ADMIN,
        isActive: true,
      }));
      console.log(`Admin user '${adminUsername}' created`);
    }
  } catch (e) {
    console.error('Seed error:', e.message);
  }

  // Seed default departments if none exist
  try {
    const deptRepo = app.get(getRepositoryToken(Department));
    const count = await deptRepo.count();
    if (count === 0) {
      const defaultDepts = [
        { name: 'Администрация', code: 'ADM' },
        { name: 'Бухгалтерия', code: 'ACC' },
        { name: 'IT-отдел', code: 'IT' },
        { name: 'Отдел кадров', code: 'HR' },
        { name: 'Производственный отдел', code: 'PROD' },
        { name: 'Склад', code: 'WH' },
        { name: 'Юридический отдел', code: 'LEGAL' },
      ];
      await deptRepo.save(defaultDepts.map(d => deptRepo.create(d)));
      console.log(`Seeded ${defaultDepts.length} default departments`);
    }
  } catch (e) {
    console.error('Department seed error:', e.message);
  }

  await app.listen(process.env.PORT || 3001);
  console.log(`Backend running on port ${process.env.PORT || 3001}`);
}

bootstrap();
