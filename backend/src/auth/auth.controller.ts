import {
	Controller,
	Get,
	UseGuards,
	Query,
	ForbiddenException,
	Req
} from '@nestjs/common';
import { Request } from 'express';
import { Payload } from './decorators/payload';
import { JwtAuthGuard } from './guards/jwt.guard';
import { JwtRefreshAuthGuard } from './guards/jwt.refresh.guard';
import { JwtLimitedAuthGuard } from './guards/jwt.limited.guard';
import { AuthService } from './auth.service';
import { JwtTokenDTO } from './dto/jwt.dto';
import { ConfigService } from '@nestjs/config';
import { MemberRepository } from '../member/member.repository';
import {
	ApiOperation,
	ApiOkResponse,
	ApiUnauthorizedResponse,
	ApiForbiddenResponse,
	ApiTags,
	ApiBearerAuth,
	ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Login')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly config: ConfigService,
		private readonly memberRepository: MemberRepository,
	) { }

	@ApiOperation({
		summary: '42 OAuth callback url',
		description: '42 OAuth will be redirected here.',
	})
	@ApiQuery({
		name: 'code',
		description: 'Code received from 42 API.',
		required: true,
		type: String
	})
	@ApiOkResponse({
		description:
			'(1) { limitedToken: ___ } Two-factor authentication is needed. \
			(2) { accessToken: ___, refreshToken: ___ } JWT token issued successfully. Login completed.',
	})
	@ApiForbiddenResponse({
		description:
			'Not a registered member yet. Please redirect to signup page.',
	})
	@Get('callback')
	async ft_login(@Query('code') code: string): Promise<any> {
		const info = await this.authService.getMemberInfo(code);
		if (info.member.twoFactor)
			return { limitedToken: info.token };
		else {
			const atoken = await this.authService.issueAccessToken(info.member.name);
			const rtoken = await this.authService.issueRefreshToken(info.member.name);
			this.authService.login(info.member.name);
			return { accessToken: atoken, refreshToken: rtoken };
		}
	}

	@ApiOperation({
		summary: 'Two-factor authentication sending code',
		description: 'Send two-factor authentication code by e-mail.',
	})
	@ApiOkResponse({
		description:
			'Two-factor authentication code has been sent.',
	})
	@ApiForbiddenResponse({
		description:
			'Two-factor authentication code has failed to be sent.',
	})
	@ApiBearerAuth()
	@Get('tfa-send')
	@UseGuards(JwtLimitedAuthGuard)
	async sendTwoFactorAuthCode(@Payload() payload: any): Promise<void> {
		const member = await this.memberRepository.getMemberInfo(payload.userName);
		const result = await this.authService.sendTfaCode(member.name, member.email);
		if (!result)
			throw new ForbiddenException('Failed to send tfa code.');
	}

	@ApiOperation({
		summary: 'Two-factor authentication',
		description: 'Verify two-factor authentication code sent by e-mail.',
	})
	@ApiQuery({
		name: 'code',
		description: 'Two-factor authentication code validate for 3 minutes.',
		required: true,
		type: String
	})
	@ApiOkResponse({
		description:
			'Two-factor authentication code has been verified. JWT token issued.',
	})
	@ApiForbiddenResponse({
		description:
			'Two-factor authentication has failed.',
	})
	@ApiBearerAuth()
	@Get('tfa-verify')
	@UseGuards(JwtLimitedAuthGuard)
	async verifyTwoFactorAuthCode(@Query('code') code: string, @Payload() payload: any): Promise<{ accessToken: string, refreshToken: string }> {
		const match = await this.authService.verifyTfaCode(payload.userName, code);
		if (!match)
			throw new ForbiddenException('Two-factor authentication failed.');
		else {
			const atoken = await this.authService.issueAccessToken(payload.userName);
			const rtoken = await this.authService.issueRefreshToken(payload.userName);
			await this.authService.login(payload.userName);
			return { accessToken: atoken, refreshToken: rtoken };
		}
	}

	@ApiOperation({
		summary: 'JWT Access Token verification',
		description: 'Login if access token is validate.',
	})
	@ApiOkResponse({
		description:
			'JWT access token verified. Login has been successful.',
	})
	@ApiUnauthorizedResponse({
		description:
			'JWT access token is not validate. Redirect to 42 login.',
	})
	@ApiForbiddenResponse({
		description:
			'JWT access token is expired. Try refreshing the token.',
	})
	@ApiBearerAuth()
	@Get('jwt-verify')
	@UseGuards(JwtAuthGuard)
	async verifyAccessToken(
		@Req() req: Request
	): Promise<void> {
		await this.authService.login(req.user['sub']);
	}

	@ApiOperation({
		summary: 'JWT refresh',
		description: 'Refresh access token.',
	})
	@ApiOkResponse({
		description:
			'JWT access token reissued successfully.',
	})
	@ApiUnauthorizedResponse({
		description:
			'JWT access token is invalid.',
	})
	@ApiBearerAuth()
	@Get('jwt-refresh')
	@UseGuards(JwtRefreshAuthGuard)
	async refreshJwtToken(
		@Payload() payload: JwtTokenDTO,
	): Promise<{ accessToken: string }> {
		const token = await this.authService.issueAccessToken(payload.userName);
		return { accessToken: token };
	}

	@ApiOperation({
		summary: 'logout',
		description: 'Delete refresh token.',
	})
	@ApiOkResponse({
		description: 'Logout has been successful.',
	})
	@ApiUnauthorizedResponse({
		description:
			'JWT access token is not validate.',
	})
	@ApiBearerAuth()
	@Get('logout')
	@UseGuards(JwtAuthGuard)
	async logout(@Payload() payload: JwtTokenDTO): Promise<void> {
		await this.authService.logout(payload.userName);
	}
}


