import { mailService } from '../src/services/mailService.js'

await mailService.sendPasswordReset({
  to: process.argv[2] || 'qualquer@exemplo.com',
  name: 'Elias',
  resetLink: 'http://localhost:5173/reset-password?token=token-de-teste'
})
