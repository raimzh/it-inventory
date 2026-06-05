import { Controller, Post, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as fs from 'fs';

@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('backup')
export class BackupController {
  constructor(private backupService: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'Список резервных копий' })
  list() { return this.backupService.listBackups(); }

  @Post()
  @ApiOperation({ summary: 'Создать резервную копию' })
  create(@CurrentUser() user: any) { return this.backupService.createBackup(user?.id, 'manual'); }

  @Get('download/:filename')
  @ApiOperation({ summary: 'Скачать резервную копию' })
  download(@Param('filename') filename: string, @Res() res: Response) {
    const fpath = this.backupService.getBackupPath(filename);
    if (!fs.existsSync(fpath)) return res.status(404).json({ message: 'Файл не найден' });
    res.set({ 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Type': 'application/octet-stream' });
    fs.createReadStream(fpath).pipe(res);
  }
}
