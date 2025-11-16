import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/api-wrapper'
import { requireTenantContext } from '@/lib/tenant-utils'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const GET = withTenantContext(async (request: NextRequest) => {
  try {
    const ctx = requireTenantContext()

    if (!ctx.userId || !ctx.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        number: true,
        amount: true,
        currency: true,
        status: true,
        issuedAt: true,
        createdAt: true,
      },
    })

    const formattedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.number,
      date: inv.issuedAt?.toISOString() || inv.createdAt.toISOString(),
      amount: inv.amount,
      currency: inv.currency || 'USD',
      status: (inv.status?.toLowerCase() || 'pending') as 'paid' | 'pending' | 'overdue',
    }))

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
    })
  } catch (error) {
    logger.error('Error fetching invoices', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
