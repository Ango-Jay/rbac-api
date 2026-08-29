import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('organisations')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
}
