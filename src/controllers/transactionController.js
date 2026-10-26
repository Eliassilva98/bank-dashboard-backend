import { asyncHandler } from '#utils/asyncHandler.js'
import { parsePagination } from '#utils/pagination.js'
import { accountService } from '#services/accountService.js'

export const transactionController = {
  create: asyncHandler(async (req, res) => {
    const result = await accountService.registerTransaction(
      req.userId,
      req.body ?? {}
    )
    return res.status(201).json(result)
  }),

  index: asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query)
    const statement = await accountService.getStatement(req.userId, pagination)
    return res.json(statement)
  })
}
