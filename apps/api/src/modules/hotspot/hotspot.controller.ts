import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HotspotService } from './hotspot.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('hotspot')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('devices/:deviceId/hotspot')
export class HotspotController {
  constructor(private readonly hotspotService: HotspotService) {}

  @Get('profiles')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List all Hotspot user profiles for this router' })
  @ApiResponse({ status: 200, description: 'List of profiles' })
  async listProfiles(@TenantId() tenantId: string, @Param('deviceId') deviceId: string) {
    return this.hotspotService.listProfiles(tenantId, deviceId);
  }

  @Post('profiles')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new Hotspot user profile on the router and platform' })
  @ApiResponse({ status: 201, description: 'Profile created' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  async createProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.hotspotService.createProfile(tenantId, deviceId, dto);
  }

  @Post('profiles/sync')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({
    summary: 'Sync profiles directly from the physical MikroTik router into database',
  })
  @ApiResponse({ status: 200, description: 'Profiles synced' })
  async syncProfiles(@TenantId() tenantId: string, @Param('deviceId') deviceId: string) {
    return this.hotspotService.syncProfiles(tenantId, deviceId);
  }

  @Delete('profiles/:profileId')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a Hotspot user profile from router and platform' })
  @ApiResponse({ status: 200, description: 'Profile deleted' })
  async deleteProfile(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.hotspotService.deleteProfile(tenantId, deviceId, profileId);
  }

  @Get('sessions')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'List live active Hotspot sessions connected to the router' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async listActiveSessions(@TenantId() tenantId: string, @Param('deviceId') deviceId: string) {
    return this.hotspotService.listActiveSessions(tenantId, deviceId);
  }

  @Post('sessions/:sessionId/kick')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Disconnect / kick an active Hotspot session from the router' })
  @ApiResponse({ status: 200, description: 'Session kicked' })
  async kickSession(
    @TenantId() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.hotspotService.kickSession(tenantId, deviceId, sessionId);
  }
}

@ApiTags('hotspot')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('hotspot')
export class TenantHotspotController {
  constructor(private readonly hotspotService: HotspotService) {}

  @Get('profiles')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List all Hotspot user profiles for the current tenant' })
  @ApiResponse({ status: 200, description: 'List of tenant profiles' })
  async listAllProfiles(@TenantId() tenantId: string) {
    return this.hotspotService.listAllProfiles(tenantId);
  }

  @Post('profiles')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new Hotspot user profile for tenant' })
  @ApiResponse({ status: 201, description: 'Profile created' })
  async createProfile(@TenantId() tenantId: string, @Body() dto: CreateProfileDto) {
    return this.hotspotService.createTenantProfile(tenantId, dto);
  }

  @Patch('profiles/:profileId')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Update a Hotspot user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @TenantId() tenantId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.hotspotService.updateTenantProfile(tenantId, profileId, dto);
  }

  @Delete('profiles/:profileId')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a Hotspot user profile' })
  @ApiResponse({ status: 200, description: 'Profile deleted' })
  async deleteProfile(
    @TenantId() tenantId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.hotspotService.deleteTenantProfile(tenantId, profileId);
  }

  @Get('sessions')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER, RoleName.CASHIER)
  @ApiOperation({ summary: 'List live active Hotspot sessions across tenant routers' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async listAllSessions(@TenantId() tenantId: string) {
    return this.hotspotService.listAllActiveSessions(tenantId);
  }

  @Post('sessions/:sessionId/kick')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Disconnect an active Hotspot session' })
  @ApiResponse({ status: 200, description: 'Session kicked' })
  async kickSession(
    @TenantId() tenantId: string,
    @Param('sessionId') sessionId: string,
    @Body('deviceId') deviceId?: string,
  ) {
    return this.hotspotService.kickTenantSession(tenantId, sessionId, deviceId);
  }
}
