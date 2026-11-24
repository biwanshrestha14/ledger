import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const CURRENCIES = ['NPR', 'INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'AED', 'NZD', 'SEK', 'BRL', 'MXN', 'ZAR'];

export class RegisterDto {
  @Transform(trim) @IsString() @Length(1, 60, { message: 'Enter your name.' }) name: string;
  @Transform(trim) @IsEmail({}, { message: 'Enter a valid email address.' }) @MaxLength(254) email: string;
  @IsString() @Length(8, 200, { message: 'Choose a password with at least 8 characters.' }) password: string;
  @IsOptional() @IsIn(CURRENCIES) currency?: string;
}

export class LoginDto {
  @Transform(trim) @IsEmail({}, { message: 'Enter a valid email address.' }) email: string;
  @IsString() @Length(1, 200) password: string;
}

export class UpdateProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsIn(CURRENCIES) currency?: string;
  @IsOptional() @IsString() @Length(2, 20) locale?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @Length(8, 200, { message: 'Choose a password with at least 8 characters.' }) newPassword: string;
}

export class DeleteAccountDto {
  @IsString() password: string;
}
