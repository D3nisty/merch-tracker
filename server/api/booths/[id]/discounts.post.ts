import { useDb } from '../../../db'
import { boothDiscounts, booths } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireBoothEdit, eventIdForBooth } from '../../../utils/permissions'

// Create a discount on a booth. Two shapes:
//
//   type='buy_get_free'  →  triggerQty + freeQty
//     e.g. "buy 2 A4 get the 3rd free"  (triggerQty=3, freeQty=1, scope=size:A4)
//
//   type='bundle'  →  triggerQty + bundlePrice + bundleCurrency
//     e.g. "3 keychains for €40 (save €5)"
//        (triggerQty=3, bundlePrice=40, bundleCurrency='EUR', scope=category:Keychain)
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const db = useDb()

  const booth = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireBoothEdit(event, boothId)

  const body = await readBody(event) as {
    label?: string
    scopeType?: 'size' | 'category'
    scopeValue?: string
    type?: 'buy_get_free' | 'bundle'
    triggerQty?: number
    freeQty?: number
    bundlePrice?: number
    bundleCurrency?: string
  }

  if (!body.label?.trim()) throw createError({ statusCode: 400, message: 'label required' })
  if (body.scopeType !== 'size' && body.scopeType !== 'category') {
    throw createError({ statusCode: 400, message: 'scopeType must be size or category' })
  }
  if (!body.scopeValue?.trim()) throw createError({ statusCode: 400, message: 'scopeValue required' })
  if (!Number.isInteger(body.triggerQty) || body.triggerQty! < 2) {
    throw createError({ statusCode: 400, message: 'triggerQty must be an integer ≥ 2' })
  }
  const type = body.type ?? 'buy_get_free'
  if (type !== 'buy_get_free' && type !== 'bundle') {
    throw createError({ statusCode: 400, message: 'type must be buy_get_free or bundle' })
  }

  let freeQty: number = 0
  let bundlePrice: number | null = null
  let bundleCurrency: string | null = null
  if (type === 'buy_get_free') {
    if (!Number.isInteger(body.freeQty) || body.freeQty! < 1 || body.freeQty! >= body.triggerQty!) {
      throw createError({ statusCode: 400, message: 'freeQty must be an integer ≥ 1 and < triggerQty' })
    }
    freeQty = body.freeQty!
  } else {
    if (typeof body.bundlePrice !== 'number' || !(body.bundlePrice >= 0)) {
      throw createError({ statusCode: 400, message: 'bundlePrice must be a non-negative number' })
    }
    if (!body.bundleCurrency?.trim()) {
      throw createError({ statusCode: 400, message: 'bundleCurrency required' })
    }
    bundlePrice = body.bundlePrice
    bundleCurrency = body.bundleCurrency.trim().toUpperCase()
  }

  const id = generateId()
  const newDiscount = {
    id,
    boothId,
    label: body.label!.trim(),
    scopeType: body.scopeType!,
    scopeValue: body.scopeValue!.trim(),
    type,
    triggerQty: body.triggerQty!,
    freeQty,
    bundlePrice,
    bundleCurrency,
    createdAt: now(),
  }
  db.insert(boothDiscounts).values(newDiscount).run()
  return newDiscount
})
