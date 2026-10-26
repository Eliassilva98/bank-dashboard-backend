import { Router } from 'express'
import { accountController } from '#controllers/accountController.js'
import { authenticate } from '#middlewares/authMiddleware.js'

const accountRoutes = Router()

accountRoutes.use(authenticate)

accountRoutes.get('/me', accountController.me)

export { accountRoutes }
