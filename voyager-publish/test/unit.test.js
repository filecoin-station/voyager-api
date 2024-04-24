import assert from 'node:assert'
import pg from 'pg'
import { publish } from '../index.js'
import {
  DATABASE_URL,
  createIEContractStub,
  createTelemetryRecorderStub,
  createWeb3StorageStub,
  givenMeasurement,
  insertMeasurement,
  logger
} from './test-helpers.js'

// Tests in this file are using the real database and mocked web3.storage & smart-contract clients.
// This allows us to run the tests locally  with no interaction with production services, and verify
// how the system handles various edge cases.

describe('publisher (unit tests)', () => {
  let pgPool

  before(async () => {
    pgPool = new pg.Pool({ connectionString: DATABASE_URL })
  })

  after(async () => {
    await pgPool.end()
  })

  beforeEach(async () => {
    await pgPool.query('DELETE FROM commitments')
    await pgPool.query('DELETE FROM measurements')
  })

  it('publishes a batch of measurements honouring the count limit', async () => {
    const measurements = [
      givenMeasurement({ cid: 'bafy1', participantAddress: 't1foobar' }),
      givenMeasurement({ cid: 'bafy2', participantAddress: 't1foobar' }),
      givenMeasurement({ cid: 'bafy3', participantAddress: 't1foobar' })
    ]
    await Promise.all(measurements.map(m => insertMeasurement(pgPool, m)))

    const { web3Storage, uploadedFiles } = createWeb3StorageStub()
    const { ieContract, committedMeasurementCIDs } = createIEContractStub()
    const { recordTelemetry } = createTelemetryRecorderStub()

    await publish({
      client: pgPool,
      web3Storage,
      ieContract,
      recordTelemetry,
      maxMeasurements: 2,
      logger
    })

    assert.strictEqual(uploadedFiles.length, 1)
    const payload = (await uploadedFiles[0].text())
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    assert.strictEqual(payload.length, 2)

    assert.deepStrictEqual(committedMeasurementCIDs, [
      // FIXME:
      // DUMMY_CID
    ])

    const published = payload[0]
    const measurementRecorded = measurements.find(m => published.cid === m.cid)
    assert(measurementRecorded, 'the first published measurement does not match any recorded measurements')

    assert.strictEqual(published.cid, measurementRecorded.cid)
    assert.strictEqual(published.inet_group, measurementRecorded.inetGroup)
    assert.strictEqual(published.car_too_large, measurementRecorded.carTooLarge)
    assert.strictEqual(published.end_at, measurementRecorded.endAt.toISOString())
    // TODO: test other fields

    // We are publishing records with invalid wallet addresses too
    assert.strictEqual(published.participant_address, 't1foobar')

    const publishedMeasurementBatches = payload.map(m => m.cid)
    const { rows: remainingMeasurements } = await pgPool.query('SELECT cid FROM measurements')
    assert.deepStrictEqual(
      remainingMeasurements.map(m => m.cid),
      measurements.map(m => m.cid).filter(cid => !publishedMeasurementBatches.includes(cid))
    )

    const { rows: commitments } = await pgPool.query('SELECT cid FROM commitments')
    assert.deepStrictEqual(
      commitments.map(m => m.cid),
      [
        // FIXME:
        // DUMMY_CID
      ]
    )
  })

  it('handles concurrent calls', async () => {
    const measurements = [
      givenMeasurement({ cid: 'bafy1' }),
      givenMeasurement({ cid: 'bafy2' }),
      givenMeasurement({ cid: 'bafy3' }),
      givenMeasurement({ cid: 'bafy4' })
    ]
    await Promise.all(measurements.map(m => insertMeasurement(pgPool, m)))

    const { web3Storage, uploadedFiles } = createWeb3StorageStub()
    const { ieContract } = createIEContractStub()
    const { recordTelemetry } = createTelemetryRecorderStub()

    // FIXME: remove this serial loop and uncomment the parallel Promise.all version below
    for (const pid of [1001, 1002]) {
      await publish({
        client: pgPool,
        web3Storage,
        ieContract,
        recordTelemetry,
        maxMeasurements: 2,
        pid,
        logger
      })
    }

    // await Promise.all([1001, 1002].map((pid) =>
    //   publish({
    //     client: pgPool,
    //     web3Storage,
    //     ieContract,
    //     recordTelemetry,
    //     maxMeasurements: 2,
    //     pid,
    //     logger
    //   })
    // ))

    assert.strictEqual(uploadedFiles.length, 2)
    const payload = (await Promise.all(uploadedFiles.map(f => f.text())))
      .join('\n')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    const publishedMeasurementBatches = payload.map(m => m.cid)
    publishedMeasurementBatches.sort()
    assert.deepStrictEqual(publishedMeasurementBatches, measurements.map(m => m.cid))

    const { rows: remainingMeasurements } = await pgPool.query('SELECT cid FROM measurements')
    assert.deepStrictEqual(
      remainingMeasurements.map(m => m.cid),
      []
    )
  })
})
