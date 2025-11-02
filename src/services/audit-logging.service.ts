import prisma from '@/lib/prisma'

/**
 * Audit log action types
 */
export enum AuditActionType {
  // User Management
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',

  // Permission Management
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  ROLE_CREATED = 'ROLE_CREATED',
  ROLE_UPDATED = 'ROLE_UPDATED',
  ROLE_DELETED = 'ROLE_DELETED',

  // Bulk Operations
  BULK_OPERATION_STARTED = 'BULK_OPERATION_STARTED',
  BULK_OPERATION_COMPLETED = 'BULK_OPERATION_COMPLETED',
  BULK_OPERATION_FAILED = 'BULK_OPERATION_FAILED',

  // Settings
  SETTING_CHANGED = 'SETTING_CHANGED',
  SETTINGS_EXPORTED = 'SETTINGS_EXPORTED',
  SETTINGS_IMPORTED = 'SETTINGS_IMPORTED',

  // System
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  FAILED_LOGIN = 'FAILED_LOGIN',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
}

/**
 * Audit log severity levels
 */
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  actionType: AuditActionType
  severity: AuditSeverity
  userId: string
  tenantId: string
  targetUserId?: string
  targetResourceId?: string
  targetResourceType?: string
  description: string
  changes?: Record<string, any>
  metadata?: Record<string, any>
  ipAddress?: string
  userAgent?: string
}

/**
 * Audit log query filters
 */
export interface AuditLogFilter {
  userId?: string
  tenantId: string
  actionType?: AuditActionType | AuditActionType[]
  targetUserId?: string
  severity?: AuditSeverity | AuditSeverity[]
  dateRange?: {
    startDate: Date
    endDate: Date
  }
  limit?: number
  offset?: number
}

/**
 * Audit logging service
 */
export class AuditLoggingService {
  /**
   * Log an audit event
   */
  static async logAuditEvent(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actionType: entry.actionType,
          severity: entry.severity,
          userId: entry.userId,
          tenantId: entry.tenantId,
          targetUserId: entry.targetUserId,
          targetResourceId: entry.targetResourceId,
          targetResourceType: entry.targetResourceType,
          description: entry.description,
          changes: entry.changes ? JSON.stringify(entry.changes) : null,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          timestamp: new Date(),
        },
      })
    } catch (error) {
      console.error('Failed to log audit event:', error)
      // Don't throw - audit logging failure shouldn't break the application
    }
  }

  /**
   * Log permission change
   */
  static async logPermissionChange(
    userId: string,
    tenantId: string,
    targetUserId: string,
    permissionsAdded: string[],
    permissionsRemoved: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    const hasChanges = permissionsAdded.length > 0 || permissionsRemoved.length > 0

    if (!hasChanges) return

    await this.logAuditEvent({
      actionType: permissionsAdded.length > 0 ? AuditActionType.PERMISSION_GRANTED : AuditActionType.PERMISSION_REVOKED,
      severity: AuditSeverity.INFO,
      userId,
      tenantId,
      targetUserId,
      targetResourceType: 'USER_PERMISSIONS',
      description: `${permissionsAdded.length > 0 ? 'Granted' : 'Revoked'} ${permissionsAdded.length + permissionsRemoved.length} permission(s) for ${targetUserId}`,
      changes: {
        added: permissionsAdded,
        removed: permissionsRemoved,
      },
      metadata,
    })
  }

  /**
   * Log role change
   */
  static async logRoleChange(
    userId: string,
    tenantId: string,
    targetUserId: string,
    fromRole: string,
    toRole: string,
    reason?: string
  ): Promise<void> {
    // Determine severity based on role change
    let severity = AuditSeverity.INFO
    if (['SUPER_ADMIN', 'ADMIN'].includes(toRole)) {
      severity = AuditSeverity.CRITICAL
    }

    await this.logAuditEvent({
      actionType: AuditActionType.ROLE_CHANGED,
      severity,
      userId,
      tenantId,
      targetUserId,
      targetResourceType: 'USER_ROLE',
      description: `Changed role for ${targetUserId} from ${fromRole} to ${toRole}${reason ? ` (${reason})` : ''}`,
      changes: {
        fromRole,
        toRole,
      },
      metadata: reason ? { reason } : undefined,
    })
  }

  /**
   * Log settings change
   */
  static async logSettingsChange(
    userId: string,
    tenantId: string,
    section: string,
    changes: Record<string, any>
  ): Promise<void> {
    await this.logAuditEvent({
      actionType: AuditActionType.SETTING_CHANGED,
      severity: AuditSeverity.INFO,
      userId,
      tenantId,
      targetResourceId: section,
      targetResourceType: 'SETTINGS',
      description: `Updated ${section} settings`,
      changes,
    })
  }

  /**
   * Log bulk operation
   */
  static async logBulkOperation(
    userId: string,
    tenantId: string,
    operationType: string,
    affectedUserCount: number,
    status: 'STARTED' | 'COMPLETED' | 'FAILED',
    metadata?: Record<string, any>
  ): Promise<void> {
    const actionType =
      status === 'STARTED' ? AuditActionType.BULK_OPERATION_STARTED :
      status === 'COMPLETED' ? AuditActionType.BULK_OPERATION_COMPLETED :
      AuditActionType.BULK_OPERATION_FAILED

    const severity =
      status === 'FAILED' ? AuditSeverity.WARNING :
      AuditSeverity.INFO

    await this.logAuditEvent({
      actionType,
      severity,
      userId,
      tenantId,
      targetResourceType: 'BULK_OPERATION',
      description: `${status} bulk operation: ${operationType} affecting ${affectedUserCount} user(s)`,
      metadata: {
        operationType,
        affectedUserCount,
        ...metadata,
      },
    })
  }

  /**
   * Query audit logs
   */
  static async queryAuditLogs(filter: AuditLogFilter): Promise<any[]> {
    const where: any = {
      tenantId: filter.tenantId,
    }

    if (filter.userId) {
      where.userId = filter.userId
    }

    if (filter.actionType) {
      where.actionType = Array.isArray(filter.actionType)
        ? { in: filter.actionType }
        : filter.actionType
    }

    if (filter.targetUserId) {
      where.targetUserId = filter.targetUserId
    }

    if (filter.severity) {
      where.severity = Array.isArray(filter.severity)
        ? { in: filter.severity }
        : filter.severity
    }

    if (filter.dateRange) {
      where.timestamp = {
        gte: filter.dateRange.startDate,
        lte: filter.dateRange.endDate,
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filter.limit || 100,
      skip: filter.offset || 0,
    })

    return logs.map(log => ({
      ...log,
      changes: log.changes ? JSON.parse(log.changes) : null,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }))
  }

  /**
   * Get audit log statistics
   */
  static async getAuditStats(
    tenantId: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<Record<string, number>> {
    const where: any = { tenantId }

    if (dateRange) {
      where.timestamp = {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      }
    }

    const actionTypeCounts = await prisma.auditLog.groupBy({
      by: ['actionType'],
      where,
      _count: true,
    })

    const stats: Record<string, number> = {}
    actionTypeCounts.forEach(({ actionType, _count }) => {
      stats[actionType] = _count
    })

    return stats
  }

  /**
   * Delete old audit logs (for retention policy)
   */
  static async deleteOldLogs(
    tenantId: string,
    retentionDays: number = 90
  ): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const result = await prisma.auditLog.deleteMany({
      where: {
        tenantId,
        timestamp: {
          lt: cutoffDate,
        },
      },
    })

    return result.count
  }

  /**
   * Export audit logs
   */
  static async exportAuditLogs(
    tenantId: string,
    filter?: AuditLogFilter
  ): Promise<string> {
    const logs = await this.queryAuditLogs({
      ...filter,
      tenantId,
      limit: 10000, // Max export limit
    })

    // Convert to CSV
    const headers = [
      'Timestamp',
      'Action Type',
      'Severity',
      'User ID',
      'Target User ID',
      'Resource Type',
      'Description',
      'IP Address',
    ]

    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.actionType,
      log.severity,
      log.userId,
      log.targetUserId || '',
      log.targetResourceType || '',
      log.description,
      log.ipAddress || '',
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    return csv
  }
}
