import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { Organisation } from './organisation.entity';

@Entity('organisation_memberships')
@Unique(['userId', 'organisationId'])
export class OrganisationMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => Organisation, { nullable: false, eager: false })
  @JoinColumn({ name: 'organisationId' })
  organisation: Organisation;

  @Column({ type: 'uuid' })
  organisationId: string;

  @Column()
  role: string;

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
