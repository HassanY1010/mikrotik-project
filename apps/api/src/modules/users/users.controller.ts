import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignDevicesDto } from './dto/assign-devices.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { CurrentUser, RequestUser } from '../../core/decorators/current-user.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('invitations')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'List pending staff invitations' })
  @ApiResponse({ status: 200, description: 'List of pending invitations' })
  async listInvitations(@TenantId() tenantId: string) {
    return this.usersService.listInvitations(tenantId);
  }

  @Post('invitations')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create and send a staff invitation' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  async createInvitation(
    @TenantId() tenantId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.createInvitation(tenantId, dto, currentUser);
  }

  @Post('invitations/:id/resend')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resend/renew a staff invitation' })
  @ApiResponse({ status: 200, description: 'Invitation renewed' })
  async resendInvitation(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.resendInvitation(tenantId, id, currentUser);
  }

  @Delete('invitations/:id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel/revoke a staff invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  async cancelInvitation(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.cancelInvitation(tenantId, id, currentUser);
  }

  @Get()
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'List all users in the current tenant organization' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(@TenantId() tenantId: string): Promise<Record<string, unknown>[]> {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'Get a specific user by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findById(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    return this.usersService.findById(tenantId, id);
  }

  @Post()
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user within tenant (Cashier, Manager)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ): Promise<Record<string, unknown>> {
    return this.usersService.create(tenantId, dto, currentUser);
  }

  @Patch(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a user within tenant' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ): Promise<Record<string, unknown>> {
    return this.usersService.update(tenantId, id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a user within tenant' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: RequestUser,
  ): Promise<{ success: boolean; message?: string }> {
    return this.usersService.delete(tenantId, id, currentUser);
  }

  @Put(':id/devices')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign MikroTik devices to a staff member' })
  @ApiResponse({ status: 200, description: 'Devices assigned successfully' })
  async assignDevices(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignDevicesDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.assignDevices(tenantId, id, dto, currentUser);
  }

  @Put(':id/permissions')
  @Roles(RoleName.TENANT_ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign custom granular permissions to a staff member' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  async assignPermissions(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.assignPermissions(tenantId, id, dto, currentUser);
  }
}
