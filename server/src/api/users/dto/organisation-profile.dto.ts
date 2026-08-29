import { IsString, IsUUID } from 'class-validator';

export class OrganisationProfileDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;
}
