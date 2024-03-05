import { ethers } from 'ethers'
import { IE_CONTRACT_ABI, IE_CONTRACT_ADDRESS, RPC_URL, GLIF_TOKEN } from '../voyager-publish/ie-contract-config.js'

const provider = new ethers.providers.JsonRpcProvider({
  url: RPC_URL,
  headers: {
    Authorization: `Bearer ${GLIF_TOKEN}`
  }
})

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug] %s\nrequest: %o\nresponse: %o', d.action, d.request, d.response))

export const createMeridianContract = async () => new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  IE_CONTRACT_ABI,
  provider
)
