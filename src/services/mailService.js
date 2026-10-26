import nodemailer from 'nodemailer'
import { env } from '#config/env.js'

let transporter

function getTransporter() {
  if (transporter) return transporter

  const { host, port, user, pass } = env.smtp

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env'
    )
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  })

  return transporter
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const mailService = {
  async sendPasswordReset({ to, name, resetLink, expiresInMinutes = 60 }) {
    const safeName = escapeHtml(name)

    return getTransporter().sendMail({
      from: env.smtp.from,
      to,
      subject: 'Redefinição de senha',
      text: [
        `Olá, ${name}!`,
        '',
        'Recebemos um pedido para redefinir a sua senha. Acesse o link abaixo:',
        resetLink,
        '',
        `O link expira em ${expiresInMinutes} minutos.`,
        'Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.'
      ].join('\n'),
      html: `
        <p>Olá, ${safeName}!</p>
        <p>Recebemos um pedido para redefinir a sua senha.</p>
        <p><a href="${resetLink}">Clique aqui para criar uma nova senha</a></p>
        <p>O link expira em ${expiresInMinutes} minutos.</p>
        <p>Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.</p>
      `
    })
  }
}
