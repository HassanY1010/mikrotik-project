import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from './core/decorators/public.decorator';

@ApiTags('root')
@Controller()
export class AppController {
  @Public()
  @Version(VERSION_NEUTRAL)
  @Get()
  @ApiOperation({ summary: 'Platform status and info' })
  getRoot() {
    return {
      name: 'MikroTik SaaS Platform API',
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      links: {
        dashboard: 'https://mikrotik-admin.onrender.com',
        docs: '/docs',
        health: '/health',
        ready: '/health/ready',
      },
      message: 'نظام إدارة شبكات وكروت المايكروتك يعمل بنجاح على السحابة.',
    };
  }
}
