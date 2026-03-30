import bencode from "bencode"
import { parentPort } from "worker_threads"

async function extractMetadata(buffer) {
    const metadata = await bencode.decode(buffer)
    
    const filename = metadata.name
    const pieces = metadata['pieces'].length / 20
    const piece_length = metadata['piece length']
    const hashes = metadata.pieces

    // const blocks = Math.floor(piece_length / 16384)
    // const hash_array = []
    // for(let i = 0; i < every_hash.length; i += 20) {
    //     hash_array.push(every_hash.slice(i, i + 20).toString('hex'))
    // }

    const total_length = piece_length * pieces

    return {filename: filename, total_length: total_length, pieces: pieces, piece_length: piece_length, hashes: hashes}
}

parentPort.on('message', async (msg) => {
    let result = await extractMetadata(msg.buffer)
    if(result) {
        parentPort.postMessage(result)
    }
})