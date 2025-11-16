import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext } from '@/lib/api-wrapper'
import { requireTenantContext } from '@/lib/tenant-utils'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const PreferencesSchema = z.object({
  language: z.string().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  timezone: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  remindersBefore: z.enum(['1day', '3days', '7days', '14days']).optional(),
})

type Preferences = z.infer<typeof PreferencesSchema>

export const GET = withTenantContext(async (request: NextRequest) => {
  try {
    const ctx = requireTenantContext()

    if (!ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        preferences: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const defaultPreferences = {
      language: 'en',
      theme: 'system',
      timezone: 'UTC',
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      weeklyDigest: true,
      remindersBefore: '7days',
    }

    return NextResponse.json({
      success: true,
      data: user.preferences || defaultPreferences,
    })
  } catch (error) {
    logger.error('Error fetching user preferences', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const PUT = withTenantContext(async (request: NextRequest) => {
  try {
    const ctx = requireTenantContext()

    if (!ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const input = PreferencesSchema.parse(body)

    const user = await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        preferences: input,
      },
      select: {
        id: true,
        preferences: true,
      },
    })

    logger.info('User preferences updated', { userId: ctx.userId })

    return NextResponse.json({
      success: true,
      data: user.preferences,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Error updating user preferences', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
