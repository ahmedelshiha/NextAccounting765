import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { hasPermission } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/admin/users/exports/schedule/[id]
 * Get a specific export schedule
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit(identifier)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasPermission(session.user.id, 'admin:users:export')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const schedule = await prisma.exportSchedule.findUnique({
      where: { id: params.id },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 10
        },
        _count: {
          select: { executions: true }
        }
      }
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      schedule: {
        ...schedule,
        totalExecutions: schedule._count.executions
      }
    })
  } catch (error) {
    console.error('Failed to fetch export schedule:', error)
    return NextResponse.json(
      { error: 'Failed to fetch export schedule' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/users/exports/schedule/[id]
 * Update a specific export schedule
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit(identifier)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasPermission(session.user.id, 'admin:users:export')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify schedule exists
    const existingSchedule = await prisma.exportSchedule.findUnique({
      where: { id: params.id }
    })

    if (!existingSchedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const {
      name,
      description,
      frequency,
      format,
      recipients,
      dayOfWeek,
      dayOfMonth,
      time,
      emailSubject,
      emailBody,
      filterPresetId,
      isActive
    } = body

    // Validate format if provided
    if (format && !['csv', 'xlsx', 'json', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Invalid export format' }, { status: 400 })
    }

    // Validate email addresses if provided
    if (recipients && Array.isArray(recipients)) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (recipients.some((email: string) => !emailRegex.test(email))) {
        return NextResponse.json(
          { error: 'One or more recipient emails are invalid' },
          { status: 400 }
        )
      }
    }

    // Update the schedule
    const updatedSchedule = await prisma.exportSchedule.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(frequency && { frequency }),
        ...(format && { format }),
        ...(recipients && { recipients }),
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        ...(dayOfMonth !== undefined && { dayOfMonth }),
        ...(time && { time }),
        ...(emailSubject && { emailSubject }),
        ...(emailBody && { emailBody }),
        ...(filterPresetId !== undefined && { filterPresetId }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      schedule: updatedSchedule,
      message: 'Export schedule updated successfully'
    })
  } catch (error) {
    console.error('Failed to update export schedule:', error)
    return NextResponse.json(
      { error: 'Failed to update export schedule' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/users/exports/schedule/[id]
 * Delete a specific export schedule
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit(identifier)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasPermission(session.user.id, 'admin:users:export')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete executions first
    await prisma.exportScheduleExecution.deleteMany({
      where: { scheduleId: params.id }
    })

    // Then delete the schedule
    const deleted = await prisma.exportSchedule.delete({
      where: { id: params.id }
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Export schedule deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete export schedule:', error)
    return NextResponse.json(
      { error: 'Failed to delete export schedule' },
      { status: 500 }
    )
  }
}
