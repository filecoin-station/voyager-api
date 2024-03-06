# voyager-api
[Voyager](https://github.com/filecoin-station/voyager) API

[![CI](https://github.com/filecoin-station/voyager-api/actions/workflows/ci.yml/badge.svg)](https://github.com/filecoin-station/voyager-api/actions/workflows/ci.yml)

## Routes

### `POST /retrievals`

Start a new retrieval.

Body:

```typescript
{
  zinniaVersion: String
}

Response:

```typescript
{
  id: String,
  cid: String
}
```

### `PATCH /retrievals/:id`

Parameters:
- `id`: Request ID (from `POST /retrievals`)

Body:

```typescript
{
  participantAddress: String,
  timeout: Boolean,
  startAt: String,       // ISO 8601
  statusCode: Number,
  firstByteAt: String,   // ISO 8601
  endAt: String,         // ISO 8601
  byteLength: Number,
  attestation: String
}
```

Dates should be formatted as [ISO 8601](https://tc39.es/ecma262/#sec-date-time-string-format)
strings.

Response:

```
OK
```

## Development

### Database

Set up [PostgreSQL](https://www.postgresql.org/) with default settings:
 - Port: 5432
 - User: _your system user name_
 - Password: _blank_
 - Database: _your system user name_

Alternatively, set the environment variable `$DATABASE_URL` with `postgres://${USER}:${PASS}@${HOST}:${POST}/${DATABASE}`.

The Postgres user and database need to already exist, and the user
needs full management permissions for the database.

You can also the following command to set up the PostgreSQL server via Docker:

```bash
docker run -d --name voyager-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=$USER \
  -e POSTGRES_DB=$USER \
  -p 5432:5432 \
  postgres
```

### `voyager-api`

Start the API service:

```bash
npm start
```

Run tests and linters:

```bash
npm test
```

## Deployment

Pushes to `main` will be deployed automatically.

Perform manual devops using [Fly.io](https://fly.io):

```bash
$ fly deploy
```
