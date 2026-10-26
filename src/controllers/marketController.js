import { asyncHandler } from '#utils/asyncHandler.js'
import { marketService } from '#services/marketService.js'

export const marketController = {
  index: asyncHandler(async (_req, res) => {
    const market = await marketService.getOverview()
    return res.json(market)
  })
}
