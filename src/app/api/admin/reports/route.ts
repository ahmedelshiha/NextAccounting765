import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { hasPermission } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/admin/reports
 * List all reports for the current user/tenant
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit(identifier)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check
    const hasAccess = await hasPermission(session.user.id, 'admin:reports:read')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get user and tenant
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'User not associated with tenant' }, { status: 400 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search') || ''

    // Build query
    const where: any = {
      tenantId: user.tenantId
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    // Get total count
    const totalCount = await prisma.report.count({ where })

    // Get reports
    const reports = await prisma.report.findMany({
      where,
      include: {
        creator: { select: { name: true, email: true } },
        _count: { select: { executions: true } }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset
    })

    return NextResponse.json({
      success: true,
      reports: reports.map(r => ({
        ...r,
        executionCount: r._count.executions
      })),
      totalCount,
      limit,
      offset
    })
  } catch (error) {
    console.error('Failed to fetch reports:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/reports
 * Create a new report
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit(identifier)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check
    const hasAccess = await hasPermission(session.user.id, 'admin:reports:write')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get user and tenant
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'User not associated with tenant' }, { status: 400 })
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
      footerText,
      templateId
    } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Report name is required' },
        { status: 400 }
      )
    }

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json(
        { error: 'Report sections are required' },
        { status: 400 }
      )
    }

    // Create the report
    const report = await prisma.report.create({
      data: {
        id: crypto.getRandomUUID(),
        tenantId: user.tenantId,
        userId: session.user.id,
        name,
        description: description || null,
        format: format || 'table',
        sections: sections || [],
        pageSize: pageSize || 'A4',
        orientation: orientation || 'portrait',
        includeHeader: includeHeader ?? true,
        includeFooter: includeFooter ?? true,
        headerText: headerText || null,
        footerText: footerText || null,
        templateId: templateId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      report,
      message: 'Report created successfully'
    })
  } catch (error) {
    console.error('Failed to create report:', error)
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    )
  }
}
