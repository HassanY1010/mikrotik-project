import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CardPdfArchiveService, PaginatedArchivesResponse, CardPdfArchiveResponse } from './card-pdf-archive.service';
import { CreateCardPdfArchiveDto } from './dto/create-card-pdf-archive.dto';
import { QueryCardPdfArchiveDto } from './dto/query-card-pdf-archive.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser, RequestUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('card-pdf-archives')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('card-pdf-archives')
export class CardPdfArchiveController {
  constructor(private readonly archiveService: CardPdfArchiveService) {}

  @Post('upload')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max PDF file size
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and archive a generated cards PDF file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        fileName: { type: 'string', example: 'SudaFi_Batch_100_Cards.pdf' },
        cardCount: { type: 'integer', example: 100 },
        templateType: { type: 'string', example: 'FOOTBALL' },
        networkName: { type: 'string', example: 'سودافاي | SudaFi Net' },
        profileName: { type: 'string', example: 'HR (يوم واحد)' },
        batchId: { type: 'string' },
        metadata: { type: 'string' },
      },
      required: ['file', 'fileName', 'cardCount'],
    },
  })
  @ApiResponse({ status: 201, description: 'PDF archived successfully' })
  async upload(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateCardPdfArchiveDto,
  ): Promise<CardPdfArchiveResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid PDF file upload is required');
    }

    return this.archiveService.archivePdf(tenantId, user.id, file.buffer, dto);
  }

  @Get()
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List archived PDF files with search, filtering, and pagination' })
  @ApiResponse({ status: 200, description: 'List of archived PDFs' })
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: QueryCardPdfArchiveDto,
  ): Promise<PaginatedArchivesResponse> {
    return this.archiveService.findAll(tenantId, query);
  }

  @Get(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Get archive details and fresh signed access URL' })
  @ApiResponse({ status: 200, description: 'Archive details' })
  @ApiResponse({ status: 404, description: 'Archive not found' })
  async findById(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CardPdfArchiveResponse> {
    return this.archiveService.findById(tenantId, id);
  }

  @Get(':id/download')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'Stream and download original archived PDF file directly' })
  @ApiResponse({ status: 200, description: 'PDF binary stream' })
  @ApiResponse({ status: 404, description: 'Archive not found' })
  async download(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.archiveService.download(tenantId, id);
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Delete(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Delete an archived PDF file from storage and database' })
  @ApiResponse({ status: 200, description: 'Archive deleted successfully' })
  @ApiResponse({ status: 404, description: 'Archive not found' })
  async delete(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.archiveService.delete(tenantId, id);
  }
}
