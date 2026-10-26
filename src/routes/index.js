import { Router } from 'express'
import { authRoutes } from './auth.routes.js'
import { accountRoutes } from './account.routes.js'
import { transactionRoutes } from './transaction.routes.js'
import { marketRoutes } from './market.routes.js'

const routes = Router()

routes.use('/auth', authRoutes)
routes.use('/accounts', accountRoutes)
routes.use('/transactions', transactionRoutes)
routes.use('/market', marketRoutes)

export { routes }
