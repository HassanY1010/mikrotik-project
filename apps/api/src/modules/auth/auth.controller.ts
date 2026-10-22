import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Ip,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../../core/decorators/public.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.authService.login(dto, ip, userAgent);

    // Set secure HTTP-only refresh token cookie
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new tenant organization with 30-day trial' })
  @ApiResponse({ status: 201, description: 'Tenant registered successfully' })
  @ApiResponse({ status: 409, description: 'Email or slug already taken' })
  async register(
    @Body() dto: RegisterTenantDto,
    @Ip() ip: string,
  ): Promise<Record<string, unknown>> {
    return this.authService.registerTenant(dto, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token rotation' })
  @ApiResponse({ status: 200, description: 'New token pair generated' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const token = dto.refreshToken?.trim() || req.cookies?.['refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const result = await this.authService.refreshToken(token, ip, userAgent);

    // Update cookie with rotated refresh token
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and revoke active session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const refreshToken = req.cookies?.['refresh_token'];
    await this.authService.logout(userId, refreshToken);

    // Clear refresh cookie
    res.clearCookie('refresh_token', {
      path: '/api/v1/auth',
    });

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current authenticated user profile, permissions, and tenant details',
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getMe(@CurrentUser('id') userId: string): Promise<Record<string, unknown>> {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change authenticated user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.changePassword(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Permanently delete authenticated user account' })
  @ApiResponse({ status: 200, description: 'Account permanently deleted' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  @ApiResponse({ status: 409, description: 'Tenant has other active users/staff' })
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.authService.deleteAccount(userId, dto);

    // Clear refresh cookie
    res.clearCookie('refresh_token', {
      path: '/api/v1/auth',
    });

    return result;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password recovery instructions and 6-digit code' })
  @ApiResponse({ status: 200, description: 'Generic recovery message dispatched' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.forgotPassword(dto, ip, userAgent);
  }

  @Public()
  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 6-digit recovery OTP code' })
  @ApiResponse({ status: 200, description: 'Code verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
  async verifyResetCode(
    @Body() dto: VerifyResetCodeDto,
    @Ip() ip: string,
  ): Promise<{ valid: boolean; resetToken: string; message: string }> {
    return this.authService.verifyResetCode(dto, ip);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set new password using code or reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code, token, or password format' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.resetPassword(dto, ip, userAgent);
  }

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'Get invitation details by token' })
  @ApiResponse({ status: 200, description: 'Invitation details' })
  @ApiResponse({ status: 404, description: 'Invitation not found or expired' })
  async getInvitation(@Param('token') token: string): Promise<Record<string, unknown>> {
    return this.authService.getInvitationDetails(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept invitation and set password' })
  @ApiResponse({ status: 200, description: 'Invitation accepted and logged in' })
  async acceptInvitation(
    @Param('token') token: string,
    @Body() dto: { password: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.authService.acceptInvitation(
      { token, password: dto.password },
      ip,
      userAgent,
    );

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return result;
  }
}

