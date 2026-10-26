export const errorHandler = (error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'error',
      message: 'JSON inválido no corpo da requisição'
    })
  }

  const statusCode = error.statusCode || 500
  const message =
    statusCode === 500 ? 'Erro interno do servidor' : error.message

  if (statusCode === 500) {
    console.error(error)
  }

  return res.status(statusCode).json({
    status: 'error',
    message
  })
}
