import net from "net"
import { v4 as uuidv4 } from "uuid"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import fs from "fs"
import crypto from "crypto"
import { Buffer } from "buffer"
import ut_pex from "ut_pex"
import utp from "utp-native"

setInterval(() => {
    parentPort.postMessage({update: true})
}, 15 * 60 * 1000)

let udp_port = 20000

async function pair(supporUdp, ip, port, info_hash, blocks, piece_length, hash_array, filename, total_length, pieces, storage) {
    // net.createServer(socket => {
    let socket;
    if(supporUdp) {
        socket = utp.connect(port, ip)
    } else {
        socket = net.connect(port, ip)
    }
    const wire = new Protocol()
    socket.setKeepAlive(true, 60000)
    socket.pipe(wire).pipe(socket)

    wire.handshake(info_hash, uuidv4(), {dht: true})

    wire.on('handshake', async (infoHash, peerId, extensions) => {
        wire.interested()
        wire.port(udp_port)
        wire.use(ut_pex())
        wire.on('unchoke', () => {
            wire.on('bitfield', async bitfield => {
                while(pieces.length < bitfield.length) {                  
                    for(let Byte = 0 ; Byte < bitfield.length; Byte++) {
                        const B = Math.floor(bitfield[Byte] / 8)
                        for(let bit = 0 ; bit < 8; bit++) {
                            if((bitfield[Byte] << bit) & 1) {
                                const index = (B * 8) + (bit % 8)
                                if(index in storage) {
                                    continue
                                }
                                const offset = 0
                                storage[index] = []
                                length = 16384
                                for(let i = 0; i < blocks; i++) {
                                    wire.request(index, offset, length, (err, block) => {
                                        if(err) {
                                            console.error(`error requesting piece: ${err}`)
                                        }
                                        if(length > piece_length - offset) {
                                            length = piece_length - offset
                                        }
                                        offset += 16384
                                        storage[index].push(block)
                                    })

                                }
                                const buffer = Buffer.from(storage[index])
                                storage[index] = buffer
                                let check = await compareHash(buffer, hash_array[index])
                                if(check) {
                                    wire.have(index)
                                    if(index * piece_length == total_length) {
                                        wire.uninterested()
                                        await writefile(`${filename}_${index}`, storage, piece_length)
                                        return true
                                    }
                                } else {
                                    delete storage.index
                                }
                            } 
                        }
                    }
                }   
                return true    
            })
            wire.on('request', (pieceIndex, offset, length, callback) => {
                // wire.piece(pieceIndex, offset, storage[pieceIndex])
                if(pieceIndex in storage) {
                    callback(null, storage[pieceIndex])
                }
            })
            wire.on('port', (dhtPort) => {
                const ip = socket.remoteAddress
                const id = peerId.toString('hex')
                parentPort.postMessage({host: ip, port: dhtPort, id: id})
            })
        })
        wire.ut_pex.on('peer', (peer, flags) => {
            let ip = peer.split(':')[0]
            let port = peer.split(':')[1]
            parentPort.postMessage({host: ip, port: port})
        })
    })
    // })
}

async function writefile(file, storage, piece_length) {
    let offset = 0
    fs.open(file, 'w', (err, fd) => {
        if(err) {
            console.error(`error open file: ${err}`)
        }
        for(let i = 0; i < storage.length; i++) {
            fs.write(fd, storage[i], offset, (err, written, buffer) => {
                if(err) {
                    console.error(`error writting file: ${err}`)
                } else {
                    offset += piece_length
                }
            })
        }
    })
}

async function compareHash(buffer, hash_array) {
    let hash = crypto.createHash('sha1').update(buffer).digest()
    if(hash.equals(hash_array)) {
        return true
    }
}

parentPort.on('message', async (msg) => {
    let result = await pair(msg.supporUdp, msg.ip, msg.port, msg.info_hash, msg.blocks, msg.piece_length, msg.hash_array, msg.filename, msg.total_length, msg.pieces, msg.storage)
    if(result) {
        parentPort.postMessage({end: result})
    }
})