// Local PostgreSQL without Docker, for development only.
// Starts a real Postgres server on port 5433 with the credentials of .env.example
// and keeps running until you press Ctrl+C. Data lives in ./.pgdata.
import { existsSync } from 'node:fs'
import path from 'node:path'

import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = path.resolve('.pgdata')
const isFirstRun = !existsSync(path.join(databaseDir, 'PG_VERSION'))

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'aesthetic',
  password: 'aesthetic',
  port: 5433,
  persistent: true,
  onLog: () => {},
  onError: message => console.error(String(message)),
})

if (isFirstRun) await pg.initialise()
await pg.start()
if (isFirstRun) await pg.createDatabase('aesthetic')

console.log('PostgreSQL is running on localhost:5433 (database "aesthetic"). Press Ctrl+C to stop.')

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
