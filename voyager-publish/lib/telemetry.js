import { InfluxDB, Point } from '@influxdata/influxdb-client'

const influx = new InfluxDB({
  url: 'https://eu-central-1-1.aws.cloud2.influxdata.com',
  // voyager-publish-write
  token: 'hiybJsgc4bGIno8jjnLKrJAud9svtSsc6gV31_vwd_bXz-wdxpQlhCeCccH-czalujeS91kICJqBqSadXjuJUA=='
})
export const writeClient = influx.getWriteApi(
  'Filecoin Station', // org
  'voyager-publish', // bucket
  'ns' // precision
)

setInterval(() => {
  writeClient.flush().catch(console.error)
}, 10_000).unref()

export const recordTelemetry = (name, fn) => {
  const point = new Point(name)
  fn(point)
  writeClient.writePoint(point)
}

export const close = () => writeClient.close()

export {
  Point
}
