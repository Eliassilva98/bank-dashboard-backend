import { beforeEach, describe, expect, it } from '@jest/globals'
import { mockDatabase } from '../helpers/mockDatabase.js'

const mocks = mockDatabase()
const { accountRepository, transactionRepository } = mocks
const { accountService } = await import('#services/accountService.js')

const myAccount = {
  id: 'acc-1',
  user_id: 'user-1',
  balance: '100.00',
  updated_at: '2026-10-20T10:00:00.000Z'
}
const targetAccount = { id: 'acc-2', name: 'João' }

const transactionRow = (overrides = {}) => ({
  id: 'tx-1',
  account_id: 'acc-1',
  counterparty_account_id: null,
  type: 'deposit',
  amount: '50.00',
  description: null,
  created_at: '2026-10-20T10:00:00.000Z',
  ...overrides
})

describe('accountService.getOverview', () => {
  beforeEach(() => mocks.reset())

  it('devolve o saldo como número (o pg entrega NUMERIC como string)', async () => {
    accountRepository.findByUserId.mockResolvedValue(myAccount)

    await expect(accountService.getOverview('user-1')).resolves.toEqual({
      user_id: 'user-1',
      account: {
        id: 'acc-1',
        balance: 100,
        updated_at: '2026-10-20T10:00:00.000Z'
      }
    })
  })

  it('404 quando o usuário não tem conta', async () => {
    accountRepository.findByUserId.mockResolvedValue(null)

    await expect(accountService.getOverview('user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Conta não encontrada'
    })
  })
})

describe('accountService.getStatement', () => {
  beforeEach(() => mocks.reset())

  it('calcula offset e totalPages e formata cada item', async () => {
    accountRepository.findByUserId.mockResolvedValue(myAccount)
    transactionRepository.listByAccountIdWithPagination.mockResolvedValue([
      transactionRow({
        type: 'transfer_in',
        counterparty_account_id: 'acc-2',
        counterparty_name: 'João'
      })
    ])
    transactionRepository.countByAccountId.mockResolvedValue(21)

    const result = await accountService.getStatement('user-1', {
      page: 3,
      pageSize: 10
    })

    expect(
      transactionRepository.listByAccountIdWithPagination
    ).toHaveBeenCalledWith('acc-1', 10, 20)
    expect(result).toMatchObject({
      page: 3,
      pageSize: 10,
      total: 21,
      totalPages: 3
    })
    expect(result.items[0]).toEqual({
      id: 'tx-1',
      type: 'transfer_in',
      amount: 50,
      description: null,
      counterparty_account_id: 'acc-2',
      counterparty: { name: 'João' },
      created_at: '2026-10-20T10:00:00.000Z'
    })
  })

  it('extrato vazio tem 0 páginas', async () => {
    accountRepository.findByUserId.mockResolvedValue(myAccount)
    transactionRepository.listByAccountIdWithPagination.mockResolvedValue([])
    transactionRepository.countByAccountId.mockResolvedValue(0)

    const result = await accountService.getStatement('user-1', {
      page: 1,
      pageSize: 10
    })

    expect(result).toMatchObject({ total: 0, totalPages: 0, items: [] })
  })
})

describe('accountService.registerTransaction: validação', () => {
  beforeEach(() => mocks.reset())

  it('rejeita tipo desconhecido (inclusive os tipos internos do banco)', async () => {
    for (const type of ['withdraw', 'transfer_in', 'transfer_out', undefined]) {
      await expect(
        accountService.registerTransaction('user-1', { type, amount: '10' })
      ).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it.each([
    '0',
    '0.00',
    '-5',
    'abc',
    '10.123',
    '10,50',
    '',
    '1234567890123',
    null,
    true,
    -10,
    0.1 + 0.2,
    Number.NaN,
    Infinity
  ])('rejeita valor inválido: %p', async (amount) => {
    await expect(
      accountService.registerTransaction('user-1', { type: 'deposit', amount })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.database.withTransaction).not.toHaveBeenCalled()
  })

  it('rejeita descrição com mais de 160 caracteres ou que não seja texto', async () => {
    for (const description of ['a'.repeat(161), 123, { x: 1 }]) {
      await expect(
        accountService.registerTransaction('user-1', {
          type: 'deposit',
          amount: '10',
          description
        })
      ).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('exige e-mail do destinatário na transferência', async () => {
    for (const targetEmail of [undefined, '', '   ', 42]) {
      await expect(
        accountService.registerTransaction('user-1', {
          type: 'transfer',
          amount: '10',
          targetEmail
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'E-mail do destinatário é obrigatório para transferência'
      })
    }
  })
})

describe('accountService.registerTransaction: depósito', () => {
  beforeEach(() => {
    mocks.reset()
    accountRepository.findByUserId.mockResolvedValue(myAccount)
    accountRepository.credit.mockResolvedValue({ balance: '150.50' })
    transactionRepository.create.mockImplementation(async (data) =>
      transactionRow({ amount: data.amount, description: data.description })
    )
  })

  it('credita e registra a transação dentro da transação do banco', async () => {
    const result = await accountService.registerTransaction('user-1', {
      type: 'deposit',
      amount: ' 50.50 ',
      description: '  Salário  '
    })

    expect(accountRepository.findByUserId).toHaveBeenCalledWith(
      'user-1',
      mocks.client
    )
    expect(accountRepository.credit).toHaveBeenCalledWith(
      'acc-1',
      '50.50',
      mocks.client
    )
    expect(transactionRepository.create).toHaveBeenCalledWith(
      {
        accountId: 'acc-1',
        counterpartyAccountId: null,
        type: 'deposit',
        amount: '50.50',
        description: 'Salário'
      },
      mocks.client
    )
    expect(result.new_balance).toBe(150.5)
    expect(result.transaction).toMatchObject({
      type: 'deposit',
      amount: 50.5,
      description: 'Salário',
      counterparty: null
    })
  })

  it('aceita valor numérico e descrição só com espaços vira null', async () => {
    await accountService.registerTransaction('user-1', {
      type: 'deposit',
      amount: 25,
      description: '   '
    })

    expect(transactionRepository.create.mock.calls[0][0]).toMatchObject({
      amount: '25',
      description: null
    })
  })

  it('descrição com exatamente 160 caracteres é aceita', async () => {
    await expect(
      accountService.registerTransaction('user-1', {
        type: 'deposit',
        amount: '10',
        description: 'a'.repeat(160)
      })
    ).resolves.toBeDefined()
  })
})

describe('accountService.registerTransaction: transferência', () => {
  const transfer = (overrides = {}) =>
    accountService.registerTransaction('user-1', {
      type: 'transfer',
      amount: '30.00',
      targetEmail: '  JOAO@Email.com ',
      ...overrides
    })

  beforeEach(() => {
    mocks.reset()
    accountRepository.findByUserId.mockResolvedValue(myAccount)
    accountRepository.findByUserEmail.mockResolvedValue(targetAccount)
    accountRepository.debit.mockResolvedValue({ balance: '70.00' })
    accountRepository.credit.mockResolvedValue({ balance: '30.00' })
    transactionRepository.create.mockImplementation(async (data) =>
      transactionRow({
        type: data.type,
        amount: data.amount,
        counterparty_account_id: data.counterpartyAccountId
      })
    )
  })

  it('trava as duas contas, debita, credita e grava as duas pontas', async () => {
    const result = await transfer()

    expect(accountRepository.findByUserEmail).toHaveBeenCalledWith(
      'joao@email.com',
      mocks.client
    )
    expect(accountRepository.lockByIds).toHaveBeenCalledWith(
      ['acc-1', 'acc-2'],
      mocks.client
    )
    expect(accountRepository.debit).toHaveBeenCalledWith(
      'acc-1',
      '30.00',
      mocks.client
    )
    expect(accountRepository.credit).toHaveBeenCalledWith(
      'acc-2',
      '30.00',
      mocks.client
    )

    const created = transactionRepository.create.mock.calls.map(
      ([data]) => data
    )
    expect(created).toEqual([
      expect.objectContaining({
        accountId: 'acc-1',
        counterpartyAccountId: 'acc-2',
        type: 'transfer_out'
      }),
      expect.objectContaining({
        accountId: 'acc-2',
        counterpartyAccountId: 'acc-1',
        type: 'transfer_in'
      })
    ])

    expect(result.new_balance).toBe(70)
    expect(result.transaction).toMatchObject({
      type: 'transfer_out',
      amount: 30,
      counterparty: { name: 'João' }
    })
  })

  it('o lock acontece antes do débito (evita corrida entre transferências)', async () => {
    await transfer()

    const lockOrder = accountRepository.lockByIds.mock.invocationCallOrder[0]
    const debitOrder = accountRepository.debit.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(debitOrder)
  })

  it('saldo insuficiente: não credita o destino nem grava transações', async () => {
    accountRepository.debit.mockResolvedValue(null)

    await expect(transfer()).rejects.toMatchObject({
      statusCode: 400,
      message: 'Saldo insuficiente'
    })
    expect(accountRepository.credit).not.toHaveBeenCalled()
    expect(transactionRepository.create).not.toHaveBeenCalled()
  })

  it('404 quando o destinatário não existe', async () => {
    accountRepository.findByUserEmail.mockResolvedValue(null)

    await expect(transfer()).rejects.toMatchObject({
      statusCode: 404,
      message: 'Conta de destino não encontrada'
    })
    expect(accountRepository.debit).not.toHaveBeenCalled()
  })

  it('não permite transferir para a própria conta', async () => {
    accountRepository.findByUserEmail.mockResolvedValue({
      id: 'acc-1',
      name: 'Eu'
    })

    await expect(transfer()).rejects.toMatchObject({
      statusCode: 400,
      message: 'Não é possível transferir para a própria conta'
    })
    expect(accountRepository.debit).not.toHaveBeenCalled()
  })
})
