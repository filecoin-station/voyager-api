import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert, { AssertionError } from 'node:assert'
import pg from 'pg'
import {
  TASKS_PER_ROUND,
  maybeCreateVoyagerRound,
  mapCurrentMeridianRoundToVoyagerRound,
  MAX_TASKS_PER_NODE
} from '../lib/round-tracker.js'

const { DATABASE_URL } = process.env
const participantAddress = 'f1abc'
const currentVoyagerRoundNumber = 42n

const VALID_MEASUREMENT = {
  cid: 'bafytest',
  protocol: 'graphsync',
  zinniaVersion: '2.3.4',
  participantAddress,
  startAt: new Date(),
  statusCode: 200,
  firstByteAt: new Date(),
  endAt: new Date(),
  byteLength: 100,
  carTooLarge: true,
  attestation: 'json.sig',
  carChecksum: 'somehash',
  indexerResult: 'OK'
}

const assertResponseStatus = async (res, status) => {
  if (res.status !== status) {
    throw new AssertionError({
      actual: res.status,
      expected: status,
      message: await res.text()
    })
  }
}

describe('Routes', () => {
  let client
  let server
  let voyager

  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    await maybeCreateVoyagerRound(client, {
      voyagerRoundNumber: currentVoyagerRoundNumber,
      meridianContractAddress: '0x1a',
      meridianRoundIndex: 123n
    })
    const handler = await createHandler({
      client,
      logger: {
        info () {},
        error: console.error,
        request () {}
      },
      getCurrentRound () {
        return {
          voyagerRoundNumber: currentVoyagerRoundNumber,
          meridianContractAddress: '0x1a',
          meridianRoundIndex: 123n
        }
      },
      domain: '127.0.0.1'
    })
    server = http.createServer(handler)
    server.listen()
    await once(server, 'listening')
    voyager = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    server.closeAllConnections()
    server.close()
    await client.end()
  })

  describe('GET /', () => {
    it('responds', async () => {
      const res = await fetch(`${voyager}/`)
      await assertResponseStatus(res, 404)
      assert.strictEqual(await res.text(), 'Not Found')
    })
  })
  describe('PATCH /retrievals/:id', () => {
    // This API endpoint is used by old clients which always send walletAddress
    const walletAddress = participantAddress

    it('returns 410 OUTDATED CLIENT', async () => {
      const result = {
        walletAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const updateRequest = await fetch(
        `${voyager}/retrievals/1`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        }
      )

      await assertResponseStatus(updateRequest, 410)
      const body = await updateRequest.text()
      assert.strictEqual(body, 'OUTDATED CLIENT')
    })
  })
  describe('GET /retrievals/:id', () => {
    it('returns error', async () => {
      const res = await fetch(`${voyager}/retrievals/0`)
      await assertResponseStatus(res, 410 /* Gone */)
    })
  })
  describe('POST /measurements', () => {
    it('records a new measurement', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT

      }

      const createRequest = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])
      assert.strictEqual(measurementRow.participant_address, participantAddress)
      assert.strictEqual(
        measurementRow.start_at.toJSON(),
        measurement.startAt.toJSON()
      )
      assert.strictEqual(measurementRow.status_code, measurement.statusCode)
      assert.strictEqual(
        measurementRow.first_byte_at.toJSON(),
        measurement.firstByteAt.toJSON()
      )
      assert.strictEqual(
        measurementRow.end_at.toJSON(),
        measurement.endAt.toJSON()
      )
      assert.strictEqual(measurementRow.byte_length, measurement.byteLength)
      assert.strictEqual(measurementRow.attestation, measurement.attestation)
      assert.strictEqual(measurementRow.cid, measurement.cid)
      assert.strictEqual(measurementRow.protocol, measurement.protocol)
      assert.strictEqual(measurementRow.zinnia_version, '2.3.4')
      assert.strictEqual(measurementRow.completed_at_round, currentVoyagerRoundNumber.toString())
      assert.match(measurementRow.inet_group, /^.{12}$/)
      assert.strictEqual(measurementRow.car_too_large, true)
      assert.strictEqual(measurementRow.indexer_result, 'OK')
      assert.strictEqual(measurementRow.car_checksum, 'somehash')
    })

    it('allows older format with walletAddress', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        // THIS IS IMPORTANT
        walletAddress: participantAddress,
        // Everything else does not matter
        cid: 'bafytest',
        protocol: 'graphsync',
        zinniaVersion: '2.3.4',
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const createRequest = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])
      assert.strictEqual(measurementRow.participant_address, participantAddress)
    })

    it('handles date fields set to null', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        cid: 'bafytest',
        protocol: 'graphsync',
        zinniaVersion: '2.3.4',
        participantAddress,
        startAt: new Date(),
        statusCode: undefined,
        firstByteAt: null,
        endAt: null
      }

      const createRequest = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])

      assert.strictEqual(measurementRow.status_code, null)
      assert.strictEqual(measurementRow.first_byte_at, null)
      assert.strictEqual(measurementRow.end_at, null)
    })

    it('allows no protocol', async () => {
      // We don't have the provider & protocol fields for deals that are not advertised to IPNI
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        protocol: undefined
      }

      const createRequest = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])

      assert.strictEqual(measurementRow.protocol, null)
    })
  })

  describe('GET /measurements/:id', () => {
    it('gets a completed retrieval', async () => {
      const retrieval = {
        cid: 'bafytest',
        protocol: 'graphsync',
        zinniaVersion: '2.3.4',
        participantAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const createRequest = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retrieval)
      })
      await assertResponseStatus(createRequest, 200)
      const { id: measurementId } = await createRequest.json()

      const res = await fetch(`${voyager}/measurements/${measurementId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, measurementId)
      assert.strictEqual(body.cid, retrieval.cid)
      assert.strictEqual(body.protocol, retrieval.protocol)
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.finishedAt)
      assert.strictEqual(body.startAt, retrieval.startAt.toJSON())
      assert.strictEqual(body.statusCode, retrieval.statusCode)
      assert.strictEqual(body.firstByteAt, retrieval.firstByteAt.toJSON())
      assert.strictEqual(body.endAt, retrieval.endAt.toJSON())
      assert.strictEqual(body.byteLength, retrieval.byteLength)
      assert.strictEqual(body.attestation, retrieval.attestation)
      assert.strictEqual(body.carTooLarge, false)
    })
  })

  describe('GET /round/meridian/:address/:round', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM voyager_rounds')

      // round 1 managed by old contract version
      let num = await mapCurrentMeridianRoundToVoyagerRound({
        pgClient: client,
        meridianContractAddress: '0xOLD',
        meridianRoundIndex: 10n
      })
      assert.strictEqual(num, 1n)

      // round 2 managed by the new contract version
      num = await mapCurrentMeridianRoundToVoyagerRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 120n
      })
      assert.strictEqual(num, 2n)

      // round 3 managed by the new contract version too
      num = await mapCurrentMeridianRoundToVoyagerRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 121n
      })
      assert.strictEqual(num, 3n)
    })

    it('returns details of the correct Voyager round', async () => {
      const res = await fetch(`${voyager}/rounds/meridian/0xNEW/120`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '2',
        maxTasksPerNode: MAX_TASKS_PER_NODE
      })
      assert.strictEqual(retrievalTasks.length, TASKS_PER_ROUND)
    })

    it('returns details of a Voyager round managed by older contract version', async () => {
      const res = await fetch(`${voyager}/rounds/meridian/0xOLD/10`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '1',
        maxTasksPerNode: MAX_TASKS_PER_NODE
      })
      assert.strictEqual(retrievalTasks.length, TASKS_PER_ROUND)
    })

    it('returns 404 for unknown round index', async () => {
      const res = await fetch(`${voyager}/rounds/meridian/0xNEW/99`)
      await assertResponseStatus(res, 404)
    })

    it('returns 404 for unknown contract address', async () => {
      const res = await fetch(`${voyager}/rounds/meridian/0xaa/120`)
      await assertResponseStatus(res, 404)
    })
  })

  describe('GET /rounds/current', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM voyager_rounds')
      await maybeCreateVoyagerRound(client, {
        voyagerRoundNumber: currentVoyagerRoundNumber,
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 123n
      })
    })

    it('returns temporary redirect with a short max-age', async () => {
      const res = await fetch(`${voyager}/rounds/current`, { redirect: 'manual' })
      await assertResponseStatus(res, 302)
      assert.strictEqual(res.headers.get('location'), '/rounds/meridian/0x1a/123')
      assert.strictEqual(res.headers.get('cache-control'), 'max-age=1')
    })

    it('returns all properties of the current round after redirect', async () => {
      const res = await fetch(`${voyager}/rounds/current`)
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(Object.keys(body), [
        'roundId',
        'maxTasksPerNode',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentVoyagerRoundNumber.toString())

      for (const t of body.retrievalTasks) {
        assert.strictEqual(typeof t.cid, 'string')
        assert.strictEqual(t.protocol, undefined)
      }
    })
  })

  describe('GET /rounds/:id', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM voyager_rounds')
      await maybeCreateVoyagerRound(client, {
        voyagerRoundNumber: currentVoyagerRoundNumber,
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 123n
      })
    })

    it('returns 404 when the round does not exist', async () => {
      const res = await fetch(`${voyager}/rounds/${currentVoyagerRoundNumber * 2n}`)
      await assertResponseStatus(res, 404)
    })

    it('returns 400 when the round is not a number', async () => {
      const res = await fetch(`${voyager}/rounds/not-a-number`)
      await assertResponseStatus(res, 400)
    })

    it('returns all properties of the specified round', async () => {
      const res = await fetch(`${voyager}/rounds/${currentVoyagerRoundNumber}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(Object.keys(body), [
        'roundId',
        'maxTasksPerNode',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentVoyagerRoundNumber.toString())
    })
  })

  describe('POST /measurements', () => {
    it('returns a measurement ID above 2^31-1', async () => {
      await client.query(`
        SELECT setval('retrieval_results_id_seq', ${2 ** 31 - 1}, true)
      `)
      const res = await fetch(`${voyager}/measurements`, {
        method: 'POST',
        body: JSON.stringify({
          cid: 'cid',
          protocol: 'http',
          participantAddress: 'address',
          startAt: new Date()
        })
      })
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(body, { id: String(2 ** 31) })
    })
  })

  describe('Redirect', () => {
    it('redirects to the right domain', async () => {
      let server
      try {
        const handler = await createHandler({
          client,
          logger: {
            info () {},
            error: console.error,
            request () {}
          },
          getCurrentRound () {
            return {
              voyagerRoundNumber: currentVoyagerRoundNumber,
              meridianContractAddress: '0x1a',
              meridianRoundIndex: 123n
            }
          },
          domain: 'foobar'
        })
        server = http.createServer(handler)
        server.listen()
        await once(server, 'listening')
        const voyager = `http://127.0.0.1:${server.address().port}`
        const res = await fetch(
          `${voyager}/rounds/${currentVoyagerRoundNumber}`,
          { redirect: 'manual' }
        )
        await assertResponseStatus(res, 301)
        assert.strictEqual(res.headers.get('location'), `https://foobar/rounds/${currentVoyagerRoundNumber}`)
      } finally {
        server.closeAllConnections()
        server.close()
      }
    })
  })
})
