import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { User } from '../../../api/users/entities/user.entity';
import { ActorType, type ActivityLogSource } from '../activity-logs.enums';

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  actorType: ActorType;

  @Column({ type: 'varchar', length: 50 })
  actor: string;

  @Column({ type: 'varchar', length: 50 })
  event: string;

  @Column({ type: 'varchar', nullable: true })
  source: ActivityLogSource | null;

  @Column({ type: 'varchar', nullable: true })
  sourceId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'uuid', nullable: true })
  organisationId: string | null;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  getActorName(
    loadedUsers: Map<
      string,
      Pick<User, 'firstName' | 'lastName' | 'email'>
    > = new Map(),
  ): string {
    if (this.actorType === ActorType.User && loadedUsers.has(this.actor)) {
      const user = loadedUsers.get(this.actor)!;
      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      return fullName || user.email || 'Unknown';
    }

    if (this.actorType === ActorType.System) {
      return 'System';
    }

    if (this.actorType === ActorType.Admin) {
      return 'Admin';
    }

    return 'Unknown';
  }
}
