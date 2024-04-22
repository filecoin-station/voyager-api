/* global File */

import { record } from './lib/telemetry.js'

export const publish = async ({
  client: pgPool,
  web3Storage,
  ieContract,
  maxMeasurements = 1000,
  logger = console
}) => {
  // Fetch measurements
  let measurements
  {
    const pgClient = await pgPool.connect()
    try {
      await pgClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE')

      // Delete published measurements
      const { rows } = await pgClient.query(`
        WITH rows AS (
          SELECT id
          FROM measurements
          WHERE lock IS NULL
          ORDER BY id
          LIMIT $1
        )
        UPDATE measurements
        SET lock = $2
        WHERE EXISTS (SELECT * FROM rows WHERE measurements.id = rows.id)
        RETURNING
          id,
          zinnia_version,
          participant_address,
          status_code,
          end_at,
          inet_group,
          car_too_large,
          cid
      `, [
        maxMeasurements,
        process.pid
      ])
      measurements = rows

      await pgClient.query('COMMIT')
    } catch (err) {
      await pgClient.query('ROLLBACK')
      throw err
    } finally {
      pgClient.release()
    }
  }

  // Fetch the count of all unpublished measurements - we need this for monitoring
  // Note: this number will be higher than `measurements.length` because voyager-api adds more
  // measurements in between the previous and the next query.
  const totalCount = (await pgPool.query(
    'SELECT COUNT(*) FROM measurements'
  )).rows[0].count

  logger.log(`Publishing ${measurements.length} measurements. Total unpublished: ${totalCount}. Batch size: ${maxMeasurements}.`)

  // Share measurements
  const start = new Date()
  const file = new File(
    [measurements.map(m => JSON.stringify(m)).join('\n')],
    'measurements.ndjson',
    { type: 'application/json' }
  )
  const cid = await web3Storage.uploadFile(file)
  const uploadMeasurementsDuration = new Date() - start
  logger.log(`Measurements packaged in ${cid}`)

  // FIXME
  // Call contract with CID
  // logger.log('ie.addMeasurements()...')
  // start = new Date()
  // FIXME: There currently are no funds in this wallet
  // const tx = await ieContract.addMeasurements(cid.toString())
  // const receipt = await tx.wait()
  // const log = ieContract.interface.parseLog(receipt.logs[0])
  // const roundIndex = log.args[1]
  // const ieAddMeasurementsDuration = new Date() - start
  // logger.log('Measurements added to round', roundIndex.toString())

  {
    const pgClient = await pgPool.connect()
    try {
      await pgClient.query('BEGIN')

      // Delete published measurements
      await pgClient.query(`
        DELETE FROM measurements
        WHERE lock = $1
      `, [
        process.pid
      ])

      // FIXME: Since we're not publishing to the contract, also don't record any
      // commitment
      // // Record the commitment for future queries
      // // TODO: store also ieContract.address and roundIndex
      // await pgClient.query('INSERT INTO commitments (cid, published_at) VALUES ($1, $2)', [
      //   cid.toString(), new Date()
      // ])

      await pgClient.query('COMMIT')
    } catch (err) {
      await pgClient.query('ROLLBACK')
      throw err
    } finally {
      pgClient.release()
    }
  }

  await pgPool.query('VACUUM measurements')

  // TODO: Add cleanup
  // We're not sure if we're going to stick with web3.storage, or switch to
  // helia or another tool. Therefore, add this later.

  logger.log('Done!')

  record('publish', point => {
    // FIXME
    // point.intField('round_index', roundIndex)
    point.intField('measurements', measurements.length)
    point.floatField('load', totalCount / maxMeasurements)
    point.intField(
      'upload_measurements_duration_ms',
      uploadMeasurementsDuration
    )
    // FIXME
    // point.intField('add_measurements_duration_ms', ieAddMeasurementsDuration)
  })
}
