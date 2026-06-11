import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Res, StreamableFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
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
const excelFileFilter = (_req: any, file: Express.Multer.File, cb: Function) => {
  const ok = EXCEL_MIME.includes(file.mimetype) ||
    ['.xlsx', '.xls'].includes(extname(file.originalname).toLowerCase());
  ok ? cb(null, true) : cb(new Error('Разрешены только файлы .xlsx и .xls'), false);
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
  @UseGuards(RolesGuard)
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
  @UseGuards(RolesGuard)
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

  @Get('excel/logs')
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

  @Delete(':id/files/:fileId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  removeFile(@Param('fileId') fileId: string) { return this.assetsService.removeFile(fileId); }
}
