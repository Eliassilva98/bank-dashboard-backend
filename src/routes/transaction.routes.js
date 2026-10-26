import { Router } from 'express'
import { transactionController } from '#controllers/transactionController.js'
import { authenticate } from '#middlewares/authMiddleware.js'

const transactionRoutes = Router()

transactionRoutes.use(authenticate)

transactionRoutes.get('/', transactionController.index)
transactionRoutes.post('/', transactionController.create)

export { transactionRoutes }
