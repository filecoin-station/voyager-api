export * from './platform-test-helpers.js'

/**
 * @param {object} props
 */
export const givenMeasurement = (props) => {
  return {
    zinniaVersion: '0.1.2',
    cid: 'bafytest',
    participantAddress: '0xDEAD',
    statusCode: 200,
    endAt: new Date('2024-01-01T10:20:30.000Z'),
    inetGroup: 'some-inet-group',
    carTooLarge: false,
    round: 123,
    ...props
  }
}

/**
 * @param {import('pg').Client} client
 * @param {object} measurement
 */
export const insertMeasurement = async (client, measurement) => {
  await client.query(`
  INSERT INTO measurements (
    zinnia_version,
    cid,
    participant_address,
    status_code,
    end_at,
    inet_group,
    car_too_large,
    completed_at_round
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
  )
`, [
    measurement.zinniaVersion,
    measurement.cid,
    measurement.participantAddress,
    measurement.statusCode,
    measurement.endAt,
    measurement.inetGroup,
    measurement.carTooLarge,
    measurement.round
  ])
}
