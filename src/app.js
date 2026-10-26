import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from '#config/env.js'
import { routes } from '#routes/index.js'
import { errorHandler } from '#middlewares/errorHandler.js'
import { AppError } from '#utils/AppError.js'

const app = express()

if (!env.isDev) {
  app.set('trust proxy', 1)
}

app.use(helmet())

app.use(cors({ origin: env.corsOrigin, credentials: true }))

app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api', routes)

app.use((_req, _res, next) => next(new AppError('Rota não encontrada', 404)))

app.use(errorHandler)

export { app }
