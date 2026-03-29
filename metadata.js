import net from "net"
import net from "net"
import { v4 as uuidv4 } from "uuid"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import ut_metadata from "ut_metadata"
import bencode from "bencode"

let udp_port = 0

async function getMetadata(supporUdp, ip, port) {
    let socket;
    if(supporUdp) {
        socket = utp.connect(port, ip)
    } else {
        socket = net.connect(port, ip)
    }
    const wire = new Protocol()

    socket.setKeepAlive(true, 45000)
    socket.pipe(wire).pipe(socket)

    wire.use(ut_metadata())

    wire.ut_metadata.fetch()

    wire.ut_metadata.on('metadata', buffer => {
        const metadata = bencode.decode(buffer)

        const piece_length = metadata['piece length']
        const pieces = metadata['pieces'].length / 20
        const every_hash = metadata.pieces
        const filename = metadata.name

        const total_length = pieces * piece_length
        const blocks = Math.floor(piece_length / 16384)

        const hash_array = []

        for(let i = 0; i < every_hash.length; i += 20) {
            hash_array.push(every_hash.slice(i, i + 20).toString('hex'))
        }

        parentPort.postMessage({blocks: blocks, piece_length: piece_length, hash_array: hash_array, filename: filename, total_length: total_length})
        return true
    })

    wire.ut_metadata.on('warning', err => {
        parentPort.postMessage({err: err.message})
        return true
    })

    wire.handshake(info_hash, uuidv4(), {dht: true})

    wire.on('handshake', async (infoHash, peerId, extensions) => {
        wire.interested()
        wire.port(udp_port)

        wire.on('port', (dhtPort) => {
            const ip = socket.remoteAddress
            const id = peerId.toString('hex')
            parentPort.postMessage({host: ip, port: dhtPort, id: id})
        })

    })

    wire.ut_pex.on('peer', (peer, flags) => {
        let ip = peer.split(':')[0]
        let port = peer.split(':')[1]
        let supporUdp = flags[2]
        parentPort.postMessage({host: ip, port: port, node: supporUdp})
    })

    socket.on('close', () => {
        parentPort.postMessage({socketClose: true})
    })
}

parentPort.on('message', async (msg) => {
    let result = await getMetadata(supporUdp, msg.ip, msg.port)
    if(result) {
        parentPort.postMessage({end: result})
    }
})