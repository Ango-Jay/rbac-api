import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('external_request_logs')
export class ExternalRequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  action: string;

  @Column()
  endpoint: string;

  @Column({ type: 'varchar', nullable: true })
  status: string | null;

  @Column({ type: 'jsonb' })
  response: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar' })
  actor: string;

  @Column({ type: 'varchar' })
  actorType: string;

  @Column({ type: 'uuid', nullable: true })
  organisationId: string | null;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
