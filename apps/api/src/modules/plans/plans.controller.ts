import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { RoleName } from '@mikrotik-saas/shared-types';
import { CurrentUser } from '../../core/decorators/current-user.decorator';

@ApiTags('Subscription Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List available subscription plans' })
  @ApiResponse({ status: 200, description: 'List of plans' })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.plansService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a subscription plan' })
  @ApiResponse({ status: 200, description: 'Plan details' })
  async findById(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new commercial subscription plan (Super Admin)' })
  @ApiResponse({ status: 201, description: 'Plan created' })
  async create(
    @Body() dto: CreatePlanDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.plansService.create(dto, adminId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update subscription plan features and limits (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.plansService.update(id, dto, adminId);
  }

  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle plan active status (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Plan status toggled' })
  async toggleActive(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.plansService.toggleActive(id, adminId);
  }
}
