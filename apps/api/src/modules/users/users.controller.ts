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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/multi-tenancy/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
  @ApiOperation({ summary: 'List all users in the current tenant organization' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(@TenantId() tenantId: string): Promise<Record<string, unknown>[]> {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)
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
  @Roles(RoleName.TENANT_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user within tenant (Cashier, Manager)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUserDto,
  ): Promise<Record<string, unknown>> {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a user within tenant' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    return this.usersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a user within tenant' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.usersService.delete(tenantId, id);
  }
}
