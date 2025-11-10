import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { hasPermission } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/admin/reports/[id]
 * Get a specific report
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

    const hasAccess = await hasPermission(session.user.id, 'admin:reports:read')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const report = await prisma.report.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { name: true, email: true } },
        executions: { orderBy: { executedAt: 'desc' }, take: 10 }
      }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      report
    })
  } catch (error) {
    console.error('Failed to fetch report:', error)
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/reports/[id]
 * Update a specific report
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

    const hasAccess = await hasPermission(session.user.id, 'admin:reports:write')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify report exists
    const existingReport = await prisma.report.findUnique({
      where: { id: params.id }
    })

    if (!existingReport) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const {
      name,
      description,
      format,
      sections,
      pageSize,
      orientation,
      includeHeader,
      includeFooter,
      headerText,
      footerText
    } = body

    // Update the report
    const updatedReport = await prisma.report.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(format && { format }),
        ...(sections && { sections }),
        ...(pageSize && { pageSize }),
        ...(orientation && { orientation }),
        ...(includeHeader !== undefined && { includeHeader }),
        ...(includeFooter !== undefined && { includeFooter }),
        ...(headerText !== undefined && { headerText }),
        ...(footerText !== undefined && { footerText }),
        updatedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      report: updatedReport,
      message: 'Report updated successfully'
    })
  } catch (error) {
    console.error('Failed to update report:', error)
    return NextResponse.json(
      { error: 'Failed to update report' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/reports/[id]
 * Delete a specific report
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

    const hasAccess = await hasPermission(session.user.id, 'admin:reports:delete')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete executions first
    await prisma.reportExecution.deleteMany({
      where: { reportId: params.id }
    })

    // Then delete the report
    const deleted = await prisma.report.delete({
      where: { id: params.id }
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Report deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete report:', error)
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    )
  }
}
