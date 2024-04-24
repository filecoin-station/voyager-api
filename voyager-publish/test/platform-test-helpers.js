// This file is shared with spark-api/spark-publish
// Helpers in this file must not have anything project-specific like measurement fields

import { CID } from 'multiformats/cid'
import { Point } from '../lib/telemetry.js'

export const { DATABASE_URL } = process.env

export const DUMMY_CID = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

export const logger = {
  log () {},
  error (...args) {
    console.error(...args)
  }
}

export const createWeb3StorageStub = () => {
  /** @type {File[]} */
  const uploadedFiles = []
  const web3Storage = {
    async uploadFile (file) {
      uploadedFiles.push(file)
      return CID.parse(DUMMY_CID)
    }
  }

  return { web3Storage, uploadedFiles }
}

export const createIEContractStub = () => {
  /** @type {string[]} */
  const committedMeasurementCIDs = []

  const ieContract = {
    async addMeasurements (cid) {
      committedMeasurementCIDs.push(cid)
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

  return { ieContract, committedMeasurementCIDs }
}

export const createTelemetryRecorderStub = () => {
  /** @type {Point[]} */
  const telemetry = []
  /**
   *
   * @param {string} measurementName
   * @param {(point: Point) => void} fn
   */
  const recordTelemetry = (measurementName, fn) => {
    const point = new Point(measurementName)
    fn(point)
    // TODO
    // debug('recordTelemetry(%s): %o', measurementName, point.fields)
    telemetry.push(point)
  }

  return { recordTelemetry, telemetry }
}
