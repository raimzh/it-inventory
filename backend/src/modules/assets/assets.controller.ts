import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, Res, StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';
import { QueryAssetsDto } from './dto/query-assets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private assetsService: AssetsService) {}

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
  uploadFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any, @Query('type') type = 'photo') {
    return this.assetsService.addFile(id, file, type, user?.id);
  }

  @Delete(':id/files/:fileId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  removeFile(@Param('fileId') fileId: string) { return this.assetsService.removeFile(fileId); }
}
