import assert from 'node:assert'
import pg from 'pg'
import { publish } from '../index.js'
import {
  DATABASE_URL,
  createTelemetryRecorderStub,
  createWeb3StorageStub,
  insertMeasurement,
  logger
} from './test-helpers.js'

// FIXME
// import { assertApproximately } from '../../test/test-helpers.js'

describe('integration', () => {
  let client

  before(async () => {
    client = new pg.Pool({ connectionString: DATABASE_URL })
  })

  after(async () => {
    await client.end()
  })

  it('publishes', async () => {
    await client.query('DELETE FROM commitments')
    await client.query('DELETE FROM measurements')

    const measurements = [{
      zinniaVersion: '0.5.6',
      cid: 'bafytest',
      participantAddress: 't1foobar',
      statusCode: 200,
      endAt: null,
      inetGroup: 'MTIzNDU2Nzg',
      carTooLarge: true,
      round: 42
    }, {
      zinniaVersion: '0.5.6',
      cid: 'bafytest',
      participantAddress: 't1foobar',
      statusCode: 200,
      endAt: null,
      inetGroup: 'MTIzNDU2Nzg',
      carTooLarge: true,
      round: 42
    }]

    for (const measurement of measurements) {
      await insertMeasurement(client, measurement)
    }

    // We're not sure if we're going to stick with web3.storage, or switch to
    // helia or another tool. Therefore, we're going to use a mock here.

    const { web3Storage, uploadedFiles } = createWeb3StorageStub()
    const { recordTelemetry } = createTelemetryRecorderStub()

    const nextMeasurement = {
      ...(measurements[0]),
      cid: 'bafynew'
    }

    // TODO: Figure out how to use anvil here
    const ieContractMeasurementCIDs = []
    const ieContract = {
      async addMeasurements (_cid) {
        ieContractMeasurementCIDs.push(_cid)
        // In real world, calling the IE contract takes ~3 minutes. In the meantime, more
        // measurements are recorded. We need to test that these measurements are not deleted.
        await insertMeasurement(client, nextMeasurement)
        return {
          async wait () {
            return {
              logs: []
            }
          }
        }
      },
      interface: {
        parseLog () {
          return {
            args: [
              null,
              1
            ]
          }
        }
      }
    }

    await publish({
      client,
      web3Storage,
      ieContract,
      recordTelemetry,
      maxMeasurements: 2,
      logger
    })

    // TODO: Check data has been committed to the contract

    assert.strictEqual(uploadedFiles.length, 1)
    // FIXME
    // assert.deepStrictEqual(ieContractMeasurementCIDs, [cid])

    const payload = (await uploadedFiles[0].text())
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    assert.strictEqual(payload.length, 2)
    const published = payload[0]
    const measurementRecorded = measurements[0]
    assert.strictEqual(published.cid, measurementRecorded.cid)
    assert.strictEqual(published.inet_group, measurementRecorded.inetGroup)
    assert.strictEqual(published.car_too_large, measurementRecorded.carTooLarge)
    assert.strictEqual(published.end_at, null)
    // TODO: test other fields

    // We are publishing records with invalid wallet addresses too
    assert.strictEqual(published.participant_address, 't1foobar')

    // FIXME
    // const { rows: commitments } = await client.query('SELECT * FROM commitments')
    // assert.deepStrictEqual(commitments.map(c => c.cid), [cid])
    // assertApproximately(commitments[0].published_at, new Date(), 1_000 /* milliseconds */)

    // Check that published measurements were deleted and measurements added later were preserved
    // const { rows: remainingMeasurements } = await client.query('SELECT cid FROM measurements')
    // assert.deepStrictEqual(remainingMeasurements.map(r => r.cid), ['bafynew'])
  })
})
