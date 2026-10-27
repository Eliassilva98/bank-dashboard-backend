# Bank Dashboard — API REST

**Back-end de uma aplicação bancária simulada**, desenvolvido com Node.js, Express e PostgreSQL. A API é responsável pela autenticação, pelas regras de movimentação financeira, pela persistência dos dados e pela consulta a indicadores econômicos.

> **Projeto de portfólio:** simula operações financeiras para fins de aprendizado e demonstração técnica. Não movimenta dinheiro real.

## Funcionalidades

| Área                 | O que a API oferece                                         |
| -------------------- | ----------------------------------------------------------- |
| Autenticação         | Cadastro, login com JWT e proteção de rotas                 |
| Recuperação de senha | Envio de link por e-mail com token temporário, de uso único |
| Contas               | Consulta de conta, saldo, receitas e despesas               |
| Movimentações        | Depósitos e transferências com persistência em PostgreSQL   |
| Extrato              | Histórico de transações, com paginação                      |
| Mercado              | Cotação do dólar, Selic e CDI, com tratamento de falhas     |

## Tecnologias

| Categoria                   | Tecnologias                                          |
| --------------------------- | ---------------------------------------------------- |
| API                         | Node.js, JavaScript, Express.js                      |
| Banco de dados              | PostgreSQL, SQL, `pg`                                |
| Autenticação                | JWT (`jsonwebtoken`), `bcryptjs`                     |
| Segurança                   | Helmet, CORS, Express Rate Limit                     |
| E-mail                      | Nodemailer                                           |
| Integrações                 | AwesomeAPI, BrasilAPI, Banco Central do Brasil (BCB) |
| Testes                      | Jest, Supertest                                      |
| Qualidade e desenvolvimento | ESLint, Prettier, Nodemon, Yarn                      |

## Arquitetura

A API segue uma **arquitetura em camadas**, separando o recebimento das requisições, as regras de negócio e o acesso ao banco de dados.

```text
Requisição HTTP
       │
       ▼
     Routes
       │
       ▼
  Controllers
       │
       ▼
   Services ────────► E-mail / APIs externas
       │
       ▼
 Repositories
       │
       ▼
  PostgreSQL
```

### Responsabilidades das camadas

| Camada           | Localização         | Responsabilidade                                   |
| ---------------- | ------------------- | -------------------------------------------------- |
| **Rotas**        | `src/routes/`       | Definir endpoints e aplicar middlewares            |
| **Controllers**  | `src/controllers/`  | Receber requisições e enviar respostas HTTP        |
| **Services**     | `src/services/`     | Executar regras de negócio e integrações           |
| **Repositories** | `src/repositories/` | Centralizar consultas SQL e persistência           |
| **Middlewares**  | `src/middlewares/`  | Autenticação, rate limiting e tratamento de erros  |
| **Configuração** | `src/config/`       | Validar variáveis de ambiente e configurar o banco |
| **Utilitários**  | `src/utils/`        | Erros, funções assíncronas e paginação             |

### Organização do repositório

A estrutura abaixo mostra as pastas principais sem sobrecarregar a leitura com todos os arquivos internos.

```text
bank-dashboard-backend/
├── migrations/          # Evolução do esquema PostgreSQL
├── scripts/             # Scripts auxiliares
├── src/
│   ├── config/          # Ambiente e conexão com o banco
│   ├── controllers/     # Entrada e saída HTTP
│   ├── middlewares/     # Segurança e erros
│   ├── repositories/    # Consultas SQL
│   ├── routes/          # Endpoints da API
│   ├── services/        # Regras de negócio
│   ├── utils/           # Funções auxiliares
│   ├── app.js           # Configuração do Express
│   └── server.js        # Inicialização do servidor
├── tests/
│   ├── helpers/         # Apoio aos testes
│   ├── integration/     # Testes de integração
│   ├── unit/            # Testes unitários
│   └── setup.js         # Configuração dos testes
├── .env.example         # Exemplo sem credenciais reais
├── .gitignore
├── package.json
└── yarn.lock
```

### Arquivos e responsabilidades principais

| Arquivo                                    | Papel no projeto                               |
| ------------------------------------------ | ---------------------------------------------- |
| `src/config/env.js`                        | Lê e valida as variáveis de ambiente           |
| `src/config/database.js`                   | Gerencia o pool PostgreSQL e as transações SQL |
| `src/services/authService.js`              | Cadastro, login e redefinição de senha         |
| `src/services/accountService.js`           | Regras relacionadas às contas                  |
| `src/services/marketService.js`            | Consulta de indicadores econômicos             |
| `src/services/mailService.js`              | Envio de e-mails com Nodemailer                |
| `src/repositories/resetTokenRepository.js` | Armazena o hash dos tokens de redefinição      |
| `src/middlewares/authMiddleware.js`        | Valida o JWT em rotas protegidas               |
| `src/middlewares/rateLimiter.js`           | Limita tentativas em rotas sensíveis           |
| `src/middlewares/errorHandler.js`          | Padroniza respostas de erro                    |

## Exemplo de fluxo: recuperação de senha

O fluxo passa por diferentes camadas da API e evita expor se um e-mail está cadastrado.

1. O cliente envia uma solicitação de recuperação de senha.
2. A rota de autenticação aplica o **rate limiter**.
3. O controller encaminha a solicitação ao serviço de autenticação.
4. O serviço gera um token temporário; o repositório armazena **apenas seu hash**.
5. O serviço de e-mail envia um link para redefinir a senha.
6. A API retorna uma resposta genérica, sem confirmar a existência do e-mail.

```text
Solicitação de recuperação
            │
            ▼
      auth.routes.js
        + rateLimiter
            │
            ▼
     authController.js
            │
            ▼
  authService.forgotPassword
            │
            ├──► resetTokenRepository.js
            │      Salva hash do token
            │
            ├──► mailService.js
            │      Envia link por e-mail
            │
            ▼
      Resposta genérica
```

O endereço de redefinição é montado a partir de `FRONTEND_URL`. A interface que abre esse link pertence a outro repositório; **este repositório contém somente a API**.

## Como executar localmente

### Pré-requisitos

- Node.js e Yarn instalados.
- Banco PostgreSQL disponível.
- Credenciais SMTP válidas, caso queira testar o envio de e-mails.

### 1. Clonar o repositório

```bash
git clone https://github.com/Eliassilva98/bank-dashboard-backend.git
cd bank-dashboard-backend
```

Substitua `https://github.com/Eliassilva98/bank-dashboard-backend.git` pelo endereço HTTPS do repositório no GitHub.

### 2. Instalar as dependências

```bash
yarn install
```

### 3. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto, usando o `.env.example` como referência:

```dotenv
NODE_ENV=development
PORT=3333

DATABASE_URL=postgresql://USUARIO:SENHA@HOST/BANCO?sslmode=require

JWT_SECRET=gere_uma_string_aleatoria_longa
JWT_EXPIRES_IN=1d

CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=seu_email@gmail.com
SMTP_PASS=senha_de_app_do_google
MAIL_FROM="Bank Dashboard <seu_email@gmail.com>"
```

> **E-mail com Gmail:** ative a verificação em duas etapas na conta Google e gere uma **senha de app** em `myaccount.google.com/apppasswords`. Use essa senha em `SMTP_PASS`, sem espaços, e o mesmo endereço em `SMTP_USER` e `MAIL_FROM`.

> **Segurança:** nunca publique o `.env`, senhas, tokens ou credenciais reais. O `.env.example` deve conter somente valores ilustrativos. Ajuste as URLs, o banco e o SMTP conforme seu ambiente.

### 4. Preparar o banco

Configure o PostgreSQL indicado em `DATABASE_URL` e aplique as migrações SQL na ordem numérica:

1. `migrations/001_create_users_and_reset_tokens.sql`
2. `migrations/002_create_accounts_and_transactions.sql`
3. `migrations/003_split_transfer_and_backfill_accounts.sql`

A forma de executar os arquivos SQL depende da instalação do PostgreSQL e das ferramentas utilizadas no seu ambiente.

### 5. Iniciar o servidor

```bash
yarn dev
```

No exemplo, a API utiliza a porta **3333**.

## Testes e qualidade de código

Os testes estão organizados entre **unitários** (`tests/unit/`) e **de integração** (`tests/integration/`). O projeto também utiliza ESLint e Prettier.

```bash
yarn test
yarn test:coverage
yarn lint
yarn format
```

Os comandos acima são os scripts informados na documentação do projeto. Consulte o `package.json` para confirmar os scripts disponíveis na sua versão.

## O que este projeto demonstra

- Organização de uma API REST em camadas, com responsabilidades bem definidas.
- Autenticação JWT, proteção de rotas e armazenamento de senhas com hash.
- Recuperação de senha por e-mail com token temporário e uso único.
- Persistência relacional com PostgreSQL e transações SQL.
- Implementação de regras para depósitos, transferências e consultas financeiras.
- Integrações externas com tratamento de falhas e fonte alternativa para indicadores.
- Testes automatizados, middlewares de segurança e tratamento centralizado de erros.

## Melhorias futuras

- Documentar os endpoints com Swagger/OpenAPI.
- Configurar CI/CD com GitHub Actions.
- Adicionar logs estruturados e observabilidade.

---

**Bank Dashboard — Back-end** · Projeto de portfólio, sem operações bancárias reais.
