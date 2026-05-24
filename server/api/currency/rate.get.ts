import { getRate } from '../../utils/currency'

/**
 * Fetch a single FX rate. Public — anyone viewing a shared event needs the
 * rate to render the converted captions next to prices. Server-side cached
 * for 12h so unauthenticated abuse can't hammer the provider.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const from = typeof query.from === 'string' ? query.from : ''
  const to = typeof query.to === 'string' ? query.to : ''
  if (!/^[A-Za-z]{3}$/.test(from) || !/^[A-Za-z]{3}$/.test(to)) {
    throw createError({ statusCode: 400, message: 'from and to must be 3-letter currency codes' })
  }
  try {
    return await getRate(from, to)
  } catch (err) {
    throw createError({
      statusCode: 502,
      message: `Failed to fetch ${from}->${to} rate: ${(err as Error).message}`,
    })
  }
})
