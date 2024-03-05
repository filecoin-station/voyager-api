import Sentry from '@sentry/node'
import { createMeridianContract } from './ie-contract.js'

// The number of tasks per round is proportionate to the Voyager round length - longer rounds require
// more tasks per round.
//
// See https://www.notion.so/pl-strflt/SPARK-tasking-v2-604e26d57f6b4892946525bcb3a77104?pvs=4#ded1cd98c2664a2289453d38e2715643
// for more details, this constant represents TC (tasks per committee).
//
// We will need to tweak this value based on measurements; that's why I put it here as a constant.
export const TASKS_PER_ROUND = 1000

// How many tasks is each Voyager checker node expected to complete every round (at most).
export const MAX_TASKS_PER_NODE = 15

/**
 * @param {import('pg').Pool} pgPool
 * @returns {() => {
 *  voyagerRoundNumber: bigint;
 *  meridianContractAddress: string;
 *  meridianRoundIndex: bigint;
 * }}
 */
export async function createRoundGetter (pgPool) {
  const contract = await createMeridianContract()

  let voyagerRoundNumber, meridianContractAddress, meridianRoundIndex

  const updateVoyagerRound = async (newRoundIndex) => {
    meridianRoundIndex = BigInt(newRoundIndex)
    meridianContractAddress = contract.address

    const pgClient = await pgPool.connect()
    try {
      await pgClient.query('BEGIN')
      voyagerRoundNumber = await mapCurrentMeridianRoundToVoyagerRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      await pgClient.query('COMMIT')
      console.log('Voyager round started: %s', voyagerRoundNumber)
    } catch (err) {
      await pgClient.query('ROLLBACK')
    } finally {
      pgClient.release()
    }
  }

  contract.on('RoundStart', (newRoundIndex) => {
    updateVoyagerRound(newRoundIndex).catch(err => {
      console.error('Cannot handle RoundStart:', err)
      Sentry.captureException(err)
    })
  })

  await updateVoyagerRound(await contract.currentRoundIndex())

  return () => ({
    voyagerRoundNumber,
    meridianContractAddress,
    meridianRoundIndex
  })
}

/*
There are three cases we need to handle:

1. Business as usual - the IE contract advanced the round by one
2. Fresh start, e.g. a new voyager-api instance is deployed, or we deploy this PR to an existing instance.
3. Upgrade of the IE contract

For each IE version (defined as the smart contract address), we are keeping track of three fields:
- `contractAddress`
- `voyagerRoundOffset`
- `lastVoyagerRoundNumber`

Whenever a new IE round is started, we know the current IE round number (`meridianRoundIndex`)

Let me explain how are the different cases handled.

**Business as usual**

We want to map IE round number to Voyager round number. This assumes we have already initialised our
DB for the current IE contract version we are working with.

```
voyagerRoundNumber = meridianRoundIndex + voyagerRoundOffset
```

For example, if we observe IE round 123, then `voyagerRoundOffset` is `-122` and we calculate the
voyager round as `123 + (-122) = 1`.

We update the record for the current IE contract address
to set `last_voyager_round_number = voyagerRoundNumber`.

**Fresh start**

There is no record in our DB. We want to map the current IE round number to Voyager round 1. Also, we
want to setup `voyagerRoundOffset` so that the algorithm above produces correct Voyager round numbers.

```
voyagerRoundNumber = 1
voyagerRoundOffset = voyagerRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `voyagerRoundOffset`,
and `last_voyager_round_number = voyagerRoundNumber`.

**Upgrading IE contract**

We have one or more existing records in our DB. We know what is the last Voyager round that we
calculated from the previous version of the IE contract (`lastVoyagerRoundNumber`). We also know what
is the round number of the new IE contract.

```
voyagerRoundNumber = lastVoyagerRoundNumber + 1
voyagerRoundOffset = voyagerRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `voyagerRoundOffset`,
and `last_voyager_round_number = voyagerRoundNumber`.

If you are wondering how to find out what is the last Voyager round that we calculated from the
previous version of the IE contract - we can easily find it in our DB:

```sql
SELECT last_voyager_round_number
FROM meridian_contract_versions
ORDER BY last_voyager_round_number DESC
LIMIT 1
```
*/

export async function mapCurrentMeridianRoundToVoyagerRound ({
  meridianContractAddress,
  meridianRoundIndex,
  pgClient
}) {
  let voyagerRoundNumber

  const { rows: [contractVersionOfPreviousVoyagerRound] } = await pgClient.query(
    'SELECT * FROM meridian_contract_versions ORDER BY last_voyager_round_number DESC LIMIT 1'
  )

  // More events coming from the same meridian contract
  if (contractVersionOfPreviousVoyagerRound?.contract_address === meridianContractAddress) {
    voyagerRoundNumber = BigInt(contractVersionOfPreviousVoyagerRound.voyager_round_offset) + meridianRoundIndex
    await pgClient.query(
      'UPDATE meridian_contract_versions SET last_voyager_round_number = $1 WHERE contract_address = $2',
      [voyagerRoundNumber, meridianContractAddress]
    )
    console.log('Mapped %s IE round index %s to Voyager round number %s',
      meridianContractAddress,
      meridianRoundIndex,
      voyagerRoundNumber
    )
  } else {
    // We are running for the first time and need to map the meridian round to voyager round 1
    // Or the contract address has changed
    const lastVoyagerRoundNumber = BigInt(contractVersionOfPreviousVoyagerRound?.last_voyager_round_number ?? 0)
    voyagerRoundNumber = lastVoyagerRoundNumber + 1n
    const voyagerRoundOffset = voyagerRoundNumber - meridianRoundIndex

    // TODO(bajtos) If we are were are reverting back to a contract address (version) we were
    // using sometime in the past, the query above will fail. We can fix the problem and support
    // this edge case by telling Postgres to ignore conflicts (`ON CONFLICT DO NOTHING)`
    await pgClient.query(`
      INSERT INTO meridian_contract_versions
      (contract_address, voyager_round_offset, last_voyager_round_number, first_voyager_round_number)
      VALUES ($1, $2, $3, $3)
    `, [
      meridianContractAddress,
      voyagerRoundOffset,
      voyagerRoundNumber
    ])
    console.log(
      'Upgraded meridian contract from %s to %s, mapping IE round index %s to Voyager round number %s',
      contractVersionOfPreviousVoyagerRound?.contract_address ?? '<n/a>',
      meridianContractAddress,
      meridianRoundIndex,
      voyagerRoundNumber
    )
  }

  await maybeCreateVoyagerRound(pgClient, { voyagerRoundNumber, meridianContractAddress, meridianRoundIndex })

  return voyagerRoundNumber
}

export async function maybeCreateVoyagerRound (pgClient, {
  voyagerRoundNumber,
  meridianContractAddress,
  meridianRoundIndex
}) {
  const { rowCount } = await pgClient.query(`
    INSERT INTO voyager_rounds
    (id, created_at, meridian_address, meridian_round, max_tasks_per_node)
    VALUES ($1, now(), $2, $3, $4)
    ON CONFLICT DO NOTHING
  `, [
    voyagerRoundNumber,
    meridianContractAddress,
    meridianRoundIndex,
    MAX_TASKS_PER_NODE
  ])

  if (rowCount) {
    // We created a new Voyager round. Let's define retrieval tasks for this new round.
    // This is a short- to medium-term solution until we move to fully decentralized tasking
    await defineTasksForRound(pgClient, voyagerRoundNumber)
  }
}

async function defineTasksForRound (pgClient, voyagerRoundNumber) {
  await pgClient.query(`
    INSERT INTO retrieval_tasks (round_id, cid)
    SELECT $1 as round_id, cid
    FROM retrievable_cids
    WHERE expires_at > now()
    ORDER BY random()
    LIMIT $2;
  `, [
    voyagerRoundNumber,
    TASKS_PER_ROUND
  ])
}
