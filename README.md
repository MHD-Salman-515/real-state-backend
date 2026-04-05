<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Urbanex backend API built with NestJS and TypeScript.

## Project setup

```bash
$ npm install
```

## Local dev startup (no required migrations)

`prisma migrate dev` is optional for local development and is **not required** to boot the server.

Recommended local startup:

```bash
export RUN_DB_HOTFIX=true
export OTP_REQUIRED=false
npx prisma generate
npm run start:dev
```

Run `npx prisma migrate dev` only when you intentionally want to create/apply new local migrations.

## OTP Email SMTP check

Configure SMTP in `.env` (for example Gmail app password or SendGrid SMTP), then run:

```bash
curl -i -X POST "http://localhost:3000/api/auth/otp/request" -H "Content-Type: application/json" -d "{\"email\":\"al123@gmail.com\"}"
```

Expected:
- API returns `200` with `{ "ok": true, "expiresAt": "..." }`
- backend log includes `[MAIL] sent ...`

Optional dev-only mail health check:

```bash
curl -s "http://localhost:3000/debug/mail"
```

## Single-server setup (housing-backend + advisor)

Run only this project (`urbanex-backend`). You do not need to run a separate `urbanex-api` server.

Use two DB connections in `.env`:

```env
DATABASE_URL="mysql://root:@localhost:3306/housing_db"
URBANEX_DATABASE_URL="mysql://root:@localhost:3306/urbanex_ai"
PORT=3000
```

Behavior:
- Main modules (`users`, `tickets`, `property`, invoices, etc.) use `DATABASE_URL` (`housing_db`).
- Advisor endpoints (`/advisor/seller-price`, `/advisor/buyer-evaluate`), advisor logs, and `/health` use `URBANEX_DATABASE_URL` (`urbanex_ai`).
- Swagger docs remain on `/docs` in the same single server.

## Prisma Baseline for `urbanex_ai` (existing non-empty DB)

If your MySQL schema already exists outside Prisma (for example database `urbanex_ai`), do this once before `migrate deploy` to avoid `P3005`:

```bash
# 1) Mark baseline migration as already applied (no DDL executed)
npx prisma migrate resolve --applied 20260303165000_baseline_urbanex_ai

# 2) Apply pending Prisma migrations (including advisor_request_logs if missing)
npx prisma migrate deploy
```

Notes:
- Baseline migration is intentionally a no-op and only initializes Prisma migration history.
- `advisor_request_logs` migration uses `CREATE TABLE IF NOT EXISTS`, so it is safe on baselined DBs even if table already exists.
- For future releases, only run:

```bash
npx prisma migrate deploy
```

## Owner Chat (migration + curl)

Apply migrations (includes owner chat tables in `housing_db`):

```bash
npx prisma migrate deploy
npx prisma generate
```

Quick API checks:

```bash
# 1) Create session
curl -X POST "http://localhost:3000/owner/chat/sessions" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"جلسة تسعير"}'

# 2) List sessions
curl "http://localhost:3000/owner/chat/sessions?limit=20" \
  -H "Authorization: Bearer <OWNER_TOKEN>"

# 3) Send message (with property context)
curl -X POST "http://localhost:3000/owner/chat/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"اقترح سعر","context":{"propertyId":12}}'

# 4) Get messages
curl "http://localhost:3000/owner/chat/sessions/<SESSION_ID>/messages?limit=50" \
  -H "Authorization: Bearer <OWNER_TOKEN>"
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
