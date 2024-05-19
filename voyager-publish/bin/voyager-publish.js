import * as Sentry from '@sentry/node'
import assert from 'node:assert'
import { newDelegatedEthAddress } from '@glif/filecoin-address'
import timers from 'node:timers/promises'
import { ethers } from 'ethers'
import { spawn } from 'node:child_process'
import { once } from 'events'
import { fileURLToPath } from 'node:url'
import { rpcUrls } from '../ie-contract-config.js'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const {
  SENTRY_ENVIRONMENT = 'development',
  WALLET_SEED,
  MIN_ROUND_LENGTH_SECONDS = 60,
  MAX_MEASUREMENTS_PER_ROUND = 1000,
  // See https://web3.storage/docs/how-to/upload/#bring-your-own-agent
  W3UP_PRIVATE_KEY,
  W3UP_PROOF,
  CONCURRENCY = 4,
  DATABASE_URL
} = process.env

Sentry.init({
  dsn: 'https://5fe1450f8649b1a8fd55093ca0d8004c@o1408530.ingest.us.sentry.io/4506870051766272',
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

assert(WALLET_SEED, 'WALLET_SEED required')
assert(W3UP_PRIVATE_KEY, 'W3UP_PRIVATE_KEY required')
assert(W3UP_PROOF, 'W3UP_PROOF required')

const minRoundLength = Number(MIN_ROUND_LENGTH_SECONDS) * 1000

const signer = ethers.Wallet.fromPhrase(WALLET_SEED)

console.log(
  'Wallet address:',
  signer.address,
  newDelegatedEthAddress(signer.address, 'f').toString()
)

let rpcUrlIndex = 0

const client = new pg.Pool({ connectionString: DATABASE_URL })
console.log('Unlocking previously locked measurements')
// FIXME
console.log('Skipping unlocking measurements')
// await client.query(
//   'UPDATE measurements SET lock = NULL WHERE lock IS NOT NULL'
// )
console.log('Unlocked measurements')
await Promise.all(new Array(CONCURRENCY).fill().map(async () => {
  while (true) {
    const lock = randomUUID()
    const lastStart = new Date()
    const ps = spawn(
      'node',
      [
        '--unhandled-rejections=strict',
        fileURLToPath(new URL('publish-batch.js', import.meta.url))
      ],
      {
        env: {
          ...process.env,
          MIN_ROUND_LENGTH_SECONDS,
          MAX_MEASUREMENTS_PER_ROUND,
          WALLET_SEED,
          W3UP_PRIVATE_KEY,
          W3UP_PROOF,
          RPC_URLS: rpcUrls[rpcUrlIndex % rpcUrls.length],
          LOCK: lock
        }
      }
    )
    ps.stdout.pipe(process.stdout)
    ps.stderr.pipe(process.stderr)
    const [code] = await once(ps, 'exit')
    if (code !== 0) {
      console.error(`Bad exit code: ${code} (lock: ${lock}`)
      Sentry.captureMessage(`Bad exit code: ${code}`)
      rpcUrlIndex++

      // FIXME: move this outside of the `code !== 0` block after `lock` index is available
      console.log(`Unlocking measurements left locked by ${lock}`)
      await client.query(
        'UPDATE measurements SET lock = NULL WHERE lock = $1',
        [lock]
      )
    }

    const dt = new Date() - lastStart
    console.log(`Done. This loop iteration took ${dt}ms.`)
    if (dt < minRoundLength) await timers.setTimeout(minRoundLength - dt)
  }
}))
