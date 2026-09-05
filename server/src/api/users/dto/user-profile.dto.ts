import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { OrganisationProfileDto } from './organisation-profile.dto';

export class UserProfileDto {
  @IsUUID()
  id: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => OrganisationProfileDto)
  @IsOptional()
  organisation: OrganisationProfileDto | null;

  @IsOptional()
  @IsString()
  role: string | null;

  @IsIn(['active', 'inactive', 'pending', 'deleted'])
  status: string;

  @IsDate()
  createdAt: Date;

  @IsDate()
  updatedAt: Date;
}
