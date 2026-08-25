import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Res, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdentityThrottlerGuard } from '../../common/throttler/identity-throttler.guard';
import { AssetsService } from './assets.service';
import { ExcelImportService } from './excel-import.service';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';
import { QueryAssetsDto } from './dto/query-assets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { v4 as uuidv4 } from 'uuid';

const EXCEL_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
// BadRequestException, а не обычный Error: иначе отказ доходит до клиента
// как «внутренняя ошибка сервера» вместо внятного объяснения.
// Подпись задана NestJS (MulterOptions.fileFilter), а не multer: у multer
// свой FileFilterCallback с необязательным вторым аргументом, и типы
// не сходятся
type MulterFileFilterCb = (error: Error | null, acceptFile: boolean) => void;

const excelFileFilter = (_req: unknown, file: Express.Multer.File, cb: MulterFileFilterCb) => {
  const ok = EXCEL_MIME.includes(file.mimetype) ||
    ['.xlsx', '.xls'].includes(extname(file.originalname).toLowerCase());
  if (ok) cb(null, true);
  else cb(new BadRequestException('Разрешены только файлы .xlsx и .xls'), false);
};

// Вложения к карточке ОС: фотографии и документы. Список закрытый —
// без него на диск попадал любой файл, включая .html и .svg, которые
// браузер способен исполнить, если их отдать с неверным типом.
const ATTACHMENT_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ...EXCEL_MIME,
];
const ATTACHMENT_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const attachmentFileFilter = (_req: unknown, file: Express.Multer.File, cb: MulterFileFilterCb) => {
  const ok = ATTACHMENT_MIME.includes(file.mimetype)
    && ATTACHMENT_EXT.includes(extname(file.originalname).toLowerCase());
  if (ok) cb(null, true);
  else cb(new BadRequestException('Допустимы только изображения и документы (jpg, png, webp, gif, pdf, doc, xls)'), false);
};

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(
    private assetsService: AssetsService,
    private excelImport: ExcelImportService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  //  Excel import endpoints  (must come BEFORE :id routes to avoid conflicts)
  // ──────────────────────────────────────────────────────────────────────────

  @Get('excel/template')
  @ApiOperation({ summary: 'Скачать шаблон Excel для импорта' })
  async downloadTemplate(@Res() res: Response) {
    const buf = await this.excelImport.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="assets_template.xlsx"',
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Post('excel/preview')
  // Разбор 20-мегабайтного файла — тяжёлая операция; ограничиваем частоту,
  // чтобы серией загрузок нельзя было занять весь CPU процесса.
  @UseGuards(RolesGuard, IdentityThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles('admin', 'accountant')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: excelFileFilter,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Предварительный просмотр данных из Excel' })
  async previewExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не загружен. Пожалуйста, выберите файл .xlsx');
    return this.excelImport.preview(file.buffer);
  }

  @Post('excel/import')
  @UseGuards(RolesGuard, IdentityThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Roles('admin', 'accountant')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: excelFileFilter,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Импорт основных средств из Excel' })
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('Файл не загружен. Пожалуйста, выберите файл .xlsx');
    return this.excelImport.importData(
      file.buffer, file.originalname,
      user?.id, user?.fullName,
    );
  }

  // Журнал импортов показывает, кто и что загружал, вместе с текстами ошибок —
  // операционные данные, доступные тем, кто ведёт учёт.
  @Get('excel/logs')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Журнал импортов из Excel' })
  getImportLogs(@Query('limit') limit = 20) {
    return this.excelImport.getLogs(Number(limit));
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Standard CRUD
  // ──────────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Список основных средств' })
  findAll(@Query() query: QueryAssetsDto) {
    return this.assetsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Статистика для дашборда' })
  getStats() { return this.assetsService.getDashboardStats(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.assetsService.findOne(id); }

  @Get(':id/history')
  getHistory(@Param('id') id: string) { return this.assetsService.getHistory(id); }

  @Get(':id/files')
  getFiles(@Param('id') id: string) { return this.assetsService.getFiles(id); }

  @Get(':id/qrcode')
  @ApiOperation({ summary: 'QR-код ОС (base64 PNG)' })
  getQrCode(@Param('id') id: string) { return this.assetsService.generateQrCode(id); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: any) {
    return this.assetsService.create(dto, user?.id, user?.fullName);
  }

  @Post('bulk-update')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  bulkUpdate(@Body() body: { ids: string[]; update: UpdateAssetDto }, @CurrentUser() user: any) {
    return this.assetsService.bulkUpdate(body.ids, body.update, user?.id, user?.fullName);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant', 'inventorizer')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @CurrentUser() user: any) {
    return this.assetsService.update(id, dto, user?.id, user?.fullName);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) { return this.assetsService.remove(id); }

  @Post(':id/files')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant', 'inventorizer')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: process.env.UPLOAD_DIR || './uploads',
      filename: (req, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: attachmentFileFilter,
  }))
  @ApiConsumes('multipart/form-data')
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('type') type = 'photo',
  ) {
    return this.assetsService.addFile(id, file, type, user?.id);
  }

  /**
   * Отдаёт вложение авторизованному пользователю.
   *
   * Раньше файлы лежали в открытом доступе: nginx отдавал /uploads/ кому
   * угодно, а защитой служило лишь то, что имя файла — UUID. Имена утекают
   * через историю браузера, Referer и логи прокси, поэтому доступ теперь
   * проходит через приложение. Токен берётся из заголовка ИЛИ из куки —
   * иначе тег <img> не смог бы загрузить картинку.
   */
  @Get(':id/files/:fileId/download')
  @ApiOperation({ summary: 'Скачать вложение' })
  async downloadFile(@Param('fileId') fileId: string, @Res() res: Response) {
    const { file, path } = await this.assetsService.getFilePath(fileId);
    res.set({
      'Content-Type': file.mimeType || 'application/octet-stream',
      // inline — чтобы фотографии показывались в карточке; тип при этом
      // ограничен списком разрешённых при загрузке
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    createReadStream(path).pipe(res);
  }

  @Delete(':id/files/:fileId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  removeFile(@Param('fileId') fileId: string) { return this.assetsService.removeFile(fileId); }
}
