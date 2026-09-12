import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ActivityLogSource, ActorType } from '../activity-logs.enums';

export class CreateActivityLogDto {
  @IsEnum(ActorType)
  actorType: ActorType;

  @IsString()
  @MaxLength(50)
  actor: string;

  @IsString()
  @MaxLength(50)
  event: string;

  @IsOptional()
  @IsEnum(ActivityLogSource)
  source?: ActivityLogSource | null;

  @IsOptional()
  @IsString()
  sourceId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string | null;

  @IsOptional()
  @IsUUID()
  organisationId?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export type ActivityLogPersistPayload = CreateActivityLogDto & {
  timestamp: Date;
};
