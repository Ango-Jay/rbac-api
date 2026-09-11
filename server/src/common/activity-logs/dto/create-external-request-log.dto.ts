import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ActorType } from '../activity-logs.enums';

export class CreateExternalRequestLogDto {
  @IsString()
  action: string;

  @IsString()
  endpoint: string;

  @IsOptional()
  @IsString()
  status?: string | null;

  @IsObject()
  response: Record<string, unknown>;

  @IsObject()
  payload: Record<string, unknown>;

  @IsString()
  actor: string;

  @IsEnum(ActorType)
  actorType: ActorType;

  @IsOptional()
  @IsUUID()
  organisationId?: string | null;
}
