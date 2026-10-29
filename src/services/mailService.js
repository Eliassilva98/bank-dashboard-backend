import nodemailer from 'nodemailer'
import { env } from '#config/env.js'

let transporter

const getTransporter = () => {
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

const escapeHtml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const parseSender = (from) => {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  if (match) return { name: match[1].trim() || undefined, email: match[2] }
  return { email: from.trim() }
}

const sendWithBrevo = async ({ to, subject, text, html }) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: parseSender(env.smtp.from),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Brevo respondeu ${response.status}: ${detail}`)
  }

  return response.json()
}

const send = (message) => {
  if (env.brevoApiKey) return sendWithBrevo(message)

  return getTransporter().sendMail({ from: env.smtp.from, ...message })
}

export const mailService = {
  async sendPasswordReset({ to, name, resetLink, expiresInMinutes = 60 }) {
    const safeName = escapeHtml(name)

    return send({
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
