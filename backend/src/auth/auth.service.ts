import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MemberRepository } from 'src/member/member.repository';
import { MailerService } from '@nestjs-modules/mailer';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom, catchError } from 'rxjs';
import FormData = require('form-data');
import axios from 'axios';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		private readonly memberRepository: MemberRepository,
		private readonly mailerService: MailerService,
		private readonly httpService: HttpService,
	) { }

	async getFortyTwoToken(code: string): Promise<any> {
		const url = this.configService.get<string>('FT_OAUTH_TOKEN_URL');
		// (1) 문자열 통으로 시도
		// const grant = 'authorization_code';
		// const id = this.configService.get<string>('FT_OAUTH_CLIENT_ID');
		// const secret = this.configService.get<string>('FT_OAUTH_SECRET');
		// const callback = this.configService.get<string>('FT_OAUTH_CALLBACK');
		// const formData = `grant_type=${grant}&client_id=${id}&client_secret=${secret}&code=${code}&redirect_uri=${callback}`;

		// (2) FormData 로 시도
		// const formData = new FormData();
		// formData.append("grant_type", "authorization_code");
		// formData.append("client_id", this.configService.get<string>('FT_OAUTH_CLIENT_ID'));
		// formData.append("client_secret", this.configService.get<string>('FT_OAUTH_SECRET'));
		// formData.append("code", code);
		// formData.append("redirect_uri", this.configService.get<string>('FT_OAUTH_CALLBACK'));

		// (3) JSON.stringify() 시도
		// const formData = {
		// 	name: JSON.stringify(
		// 		{
		// 			grant_type: 'authorization_code',
		// 			client_id: this.configService.get<string>('FT_OAUTH_CLIENT_ID'),
		// 			client_secret: this.configService.get<string>('FT_OAUTH_SECRET'),
		// 			code: code,
		// 			redirect_uri: this.configService.get<string>('FT_OAUTH_CALLBACK'),
		// 		})
		// }

		// try {
		// 	const response = await this.httpService.request({
		// 		baseURL: url,
		// 		method: "POST",
		// 		data: formData,
		// 		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		// 	}
		// 	).toPromise();
		// 	return response.data;
		// } catch (e) {
		// 	return e;
		// }

		// const response = await axios.post('https://api.intra.42.fr/oauth/token', {
		// 	grant_type: 'authorization_code',
		// 	client_id: this.configService.get<string>('FT_OAUTH_CLIENT_ID'),
		// 	client_secret: this.configService.get<string>('FT_OAUTH_SECRET'),
		// 	code: code,
		// 	redirect_uri: this.configService.get<string>('FT_OAUTH_CALLBACK'),
		// });
		// return response.data.access_token;

		const body = {
			grant_type: 'authorization_code',
			client_id: 'u-s4t2ud-e083e2d9e7bae04491cf6324a0737440768a688589004863f89febe248b86281',
			client_secret: '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',
			code: code,
			redirect_uri: 'http://localhost:3000/auth/callback',
		};

		const response = await this.httpService.post(url, body).toPromise();
		return response.data;
	}

	/**
	 * Profile Properties
	 * 
	 * id, email, login, url, phone, displayname, image_url, ...
	 */
	async getFortyTwoProfile(token: string): Promise<any> {
		const requestConfig: AxiosRequestConfig = {
			headers: { Authorization: 'Bearer ' + token },
		}

		const url = this.configService.get<string>('FT_API_ME_URL');
		const profile = await firstValueFrom(this.httpService.get(url, requestConfig)
			.pipe(
				catchError(e => {
					throw new HttpException(e.response.data, e.response.status);
				}),
			));
		console.log(profile);
		return profile;
	}

	verifyAccessToken(token: string) {
		try {
			return this.jwtService.verify(token);
		} catch (err) {
			console.log('JWT access token verification failed.');
			return;
		}
	}

	verifyRefreshToken(token: string) {
		try {
			return this.jwtService.verify(token, {
				secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
			});
		} catch (err) {
			console.log('JWT refresh token verification failed.');
			return;
		}
	}

	async issueLimitedAccessToken(userName: string): Promise<string> {
		const bodyFormData = {
			sub: userName,
		};
		const token = this.jwtService.signAsync(
			bodyFormData,
			{
				secret: this.configService.get<string>('JWT_LIMITED_SECRET'),
				expiresIn: this.configService.get<string>('JWT_LIMITED_EXPIRE_TIME'),
			},
		);
		return token;
	}

	async issueAccessToken(userName: string, tfa: boolean): Promise<string> {
		const bodyFormData = {
			sub: userName,
			tfaCheck: tfa,
		};
		const token = this.jwtService.signAsync(
			bodyFormData,
			{
				secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
				expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRE_TIME'),
			},
		);
		return token;
	}

	async issueRefreshToken(userName: string, tfa: boolean): Promise<string> {
		const bodyFormData = {
			sub: userName,
			tfaCheck: tfa,
		};
		const token = this.jwtService.sign(
			bodyFormData,
			{
				secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
				expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRE_TIME'),
			},
		);
		await this.memberRepository.updateRefreshToken(userName, token);
		return token;
	}

	async refreshAccessToken(
		userName: string,
		refreshToken: string,
		tfa: boolean
	): Promise<string> {
		if (!this.verifyRefreshToken(refreshToken)) throw new HttpException('Refresh token is invalid.', 401);
		const token = await this.issueAccessToken(userName, tfa);
		return token;
	}

	async logout(name: string): Promise<void> {
		await this.memberRepository.deleteRefreshToken(name);
		await this.memberRepository.updateStatus(name, 0);
	}

	async sendTfaCode(name: string, email: string): Promise<boolean> {
		const code = await this.memberRepository.generateTfaCode(name);
		// // TODO: Implement issueLimitedTimeToken
		// const limitedTimeToken = this.issueLimitedTimeToken(member.intraId);
		const success = await this.mailerService.
			sendMail({
				to: email,
				from: 'tspong@naver.com',
				subject: 'Pong Two-factor Authentication Code',
				html: `Your two-factor authentication code is [ ${code} ].`,
			})
			.then(() => { return true; })
			.catch((err) => {
				console.log('Failed to send email.');
				return false;
			}
			);
		if (!success)
			return false;
		return true;
	}

	async verifyTfaCode(name: string, code: string): Promise<boolean> {
		const info = await this.memberRepository.getTfaCode(name);
		if (info.tfaCode != code)
			return false;
		return true;
	}
}
