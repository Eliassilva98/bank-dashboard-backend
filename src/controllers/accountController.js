import { asyncHandler } from '#utils/asyncHandler.js'
import { accountService } from '#services/accountService.js'

export const accountController = {
  me: asyncHandler(async (req, res) => {
    const overview = await accountService.getOverview(req.userId)
    return res.json(overview)
  })
}
