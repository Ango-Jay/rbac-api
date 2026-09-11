import { IsString, IsUUID, MinLength } from 'class-validator';

export class AcceptMemberInviteDto {
  @IsUUID()
  id: string;

  @IsString()
  @MinLength(8)
  password: string;
}
