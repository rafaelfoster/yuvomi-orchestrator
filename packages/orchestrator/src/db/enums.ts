// Canonical value sets for columns that would be enums if SQLite supported
// them (see prisma/schema.prisma). Application code must only ever write
// these values into the corresponding String columns.

export const TENANT_STATUS = [
  "PROVISIONING",
  "RUNNING",
  "PAUSED",
  "UNHEALTHY",
  "STOPPED",
  "DELETING",
] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

export const INVITE_CHANNEL = ["EMAIL", "WHATSAPP"] as const;
export type InviteChannel = (typeof INVITE_CHANNEL)[number];

export const SCHEDULE_TYPE = ["UPDATE", "RESTART"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPE)[number];

export const SCHEDULE_STATUS = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUS)[number];

export const BACKUP_STATUS = ["RUNNING", "SUCCESS", "FAILED"] as const;
export type BackupStatus = (typeof BACKUP_STATUS)[number];
