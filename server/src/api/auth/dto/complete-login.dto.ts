import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CompleteLoginDto {
  @IsString()
  @MinLength(1)
  authToken: string;

  @IsOptional()
  @IsUUID()
  organisationId?: string;
}
