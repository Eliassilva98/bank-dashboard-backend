import { Router } from 'express'
import { authenticate } from '#middlewares/authMiddleware.js'
import { marketController } from '#controllers/marketController.js'

const marketRoutes = Router()

marketRoutes.use(authenticate)
marketRoutes.get('/', marketController.index)

export { marketRoutes }
