import { withTransaction } from '#config/database.js'
import { accountRepository } from '#repositories/accountRepository.js'
import { transactionRepository } from '#repositories/transactionRepository.js'
import { AppError } from '#utils/AppError.js'

const TRANSACTION_TYPES = ['deposit', 'transfer']
const MAX_DESCRIPTION_LENGTH = 160

const AMOUNT_REGEX = /^\d{1,12}(\.\d{1,2})?$/

const toMoney = (value) => Number(value)

const toAccountResponse = (account) => ({
  id: account.id,
  balance: toMoney(account.balance),
  updated_at: account.updated_at
})

const toTransactionResponse = (row) => ({
  id: row.id,
  type: row.type,
  amount: toMoney(row.amount),
  description: row.description,
  counterparty_account_id: row.counterparty_account_id,
  counterparty: row.counterparty_name ? { name: row.counterparty_name } : null,
  created_at: row.created_at
})

const parseAmount = (amount) => {
  const raw = typeof amount === 'number' ? String(amount) : amount

  if (typeof raw !== 'string' || !AMOUNT_REGEX.test(raw.trim())) {
    throw new AppError(
      'Valor inválido: informe um número positivo com até 2 casas decimais'
    )
  }

  const normalized = raw.trim()

  if (Number(normalized) <= 0) {
    throw new AppError('O valor da transação deve ser maior que zero')
  }

  return normalized
}

const parseDescription = (description) => {
  if (description === undefined || description === null) return null

  if (typeof description !== 'string') {
    throw new AppError('Descrição inválida')
  }

  const trimmed = description.trim()

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new AppError(
      `A descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres`
    )
  }

  return trimmed || null
}

const findAccountOrFail = async (userId, db) => {
  const account = await accountRepository.findByUserId(userId, db)

  if (!account) {
    throw new AppError('Conta não encontrada', 404)
  }

  return account
}

const deposit = async (userId, { amount, description }) => {
  return withTransaction(async (client) => {
    const account = await findAccountOrFail(userId, client)

    const { balance } = await accountRepository.credit(
      account.id,
      amount,
      client
    )

    const transaction = await transactionRepository.create(
      {
        accountId: account.id,
        counterpartyAccountId: null,
        type: 'deposit',
        amount,
        description
      },
      client
    )

    return {
      transaction: toTransactionResponse(transaction),
      new_balance: toMoney(balance)
    }
  })
}

const transfer = async (userId, { amount, targetEmail, description }) => {
  return withTransaction(async (client) => {
    const account = await findAccountOrFail(userId, client)
    const target = await accountRepository.findByUserEmail(targetEmail, client)

    if (!target) {
      throw new AppError('Conta de destino não encontrada', 404)
    }

    if (target.id === account.id) {
      throw new AppError('Não é possível transferir para a própria conta')
    }

    await accountRepository.lockByIds([account.id, target.id], client)

    const debited = await accountRepository.debit(account.id, amount, client)

    if (!debited) {
      throw new AppError('Saldo insuficiente')
    }

    await accountRepository.credit(target.id, amount, client)

    const outgoing = await transactionRepository.create(
      {
        accountId: account.id,
        counterpartyAccountId: target.id,
        type: 'transfer_out',
        amount,
        description
      },
      client
    )

    await transactionRepository.create(
      {
        accountId: target.id,
        counterpartyAccountId: account.id,
        type: 'transfer_in',
        amount,
        description
      },
      client
    )

    return {
      transaction: toTransactionResponse({
        ...outgoing,
        counterparty_name: target.name
      }),
      new_balance: toMoney(debited.balance)
    }
  })
}

export const accountService = {
  async getOverview(userId) {
    const account = await findAccountOrFail(userId)

    return {
      user_id: userId,
      account: toAccountResponse(account)
    }
  },

  async getStatement(userId, { page, pageSize }) {
    const account = await findAccountOrFail(userId)
    const offset = (page - 1) * pageSize

    const [items, total] = await Promise.all([
      transactionRepository.listByAccountIdWithPagination(
        account.id,
        pageSize,
        offset
      ),
      transactionRepository.countByAccountId(account.id)
    ])

    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: items.map(toTransactionResponse)
    }
  },

  async registerTransaction(
    userId,
    { type, amount, targetEmail, description }
  ) {
    if (!TRANSACTION_TYPES.includes(type)) {
      throw new AppError(
        "Tipo de transação inválido. Use 'deposit' ou 'transfer'"
      )
    }

    const parsed = {
      amount: parseAmount(amount),
      description: parseDescription(description)
    }

    if (type === 'deposit') {
      return deposit(userId, parsed)
    }

    if (typeof targetEmail !== 'string' || !targetEmail.trim()) {
      throw new AppError(
        'E-mail do destinatário é obrigatório para transferência'
      )
    }

    return transfer(userId, {
      ...parsed,
      targetEmail: targetEmail.trim().toLowerCase()
    })
  }
}
