BEGIN;

INSERT INTO accounts (user_id)
SELECT u.id
FROM users u
LEFT JOIN accounts a ON a.user_id = u.id
WHERE a.id IS NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

INSERT INTO transactions (
  account_id,
  counterparty_account_id,
  type,
  amount,
  description,
  created_at
)
SELECT
  counterparty_account_id,
  account_id,
  'transfer_in',
  amount,
  description,
  created_at
FROM transactions
WHERE type = 'transfer'
  AND counterparty_account_id IS NOT NULL;

UPDATE transactions
SET type = 'transfer_out'
WHERE type = 'transfer';

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'transfer_in', 'transfer_out'));

ALTER TABLE transactions
  ADD CONSTRAINT transactions_deposit_without_counterparty_check
  CHECK (type <> 'deposit' OR counterparty_account_id IS NULL);

COMMIT;
