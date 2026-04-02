import net from "net"
import { v4 as uuidv4 } from "uuid"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import crypto from "crypto"
import ut_pex from "ut_pex"
import utp from "utp-native"
import { buffer } from "stream/consumers"

let tu = false
let hs = false

setInterval(() => {
    parentPort.postMessage({update: true})
}, 15 * 60 * 1000)

let check = setTimeout(() => {
    if(!tu) {
        parentPort.postMessage({tcp_udp: true})
    }
}, 5000)

let udp_port = 20000

let storage = {}

async function tcp_download(ip, port, info_hash, blocks, piece_length, hash_array, total_length, storage, change=false) {
    let socket = net.createConnection(port, ip, () => {
        tu = true
        clearTimeout(check)
        // let socket;
        // if(supporUdp) {
        //     socket = utp.connect(port, ip)
        // } else {
        //     socket = net.connect(port, ip)
        // }
        const wire = new Protocol()
        socket.setKeepAlive(true, 60000)
        socket.pipe(wire).pipe(socket)

        wire.use(ut_pex())

        let check = setTimeout(() => {
            if(!hs) {
                parentPort.postMessage({handshake: true})
                clearTimeout(check)
                socket.destroy()
            }
        }, 2000);
        wire.handshake(info_hash, uuidv4(), {dht: true})

        wire.on('extended', (ext, obj) => {
            if("ut_pex" in obj.m) {
                wire.ut_pex.on('peer', (peer, flags) => {
                    const ip = peer.split(':')[0]
                    const port = peer.split(':')[1]
                    const supportUdp = flags[2]
                    parentPort.postMessage({peer: true, supportUdp: supportUdp, host: ip, port: port})
                })

                wire.ut_pex.on('dropped', (peer) => {
                    let ip = peer.split(':')[0]
                    parentPort.postMessage({dropped: true, host: ip})
                })

            }
        })

        wire.on('handshake', async (infoHash, peerId, extensions) => {
            hs = true
            wire.interested()
            wire.port(udp_port)
            wire.on('unchoke', () => {
                wire.on('bitfield', async bitfield => {
                    while(storage.length < bitfield.length) {                  
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
                                    let buffer = Buffer.from(storage[index])
                                    storage[index] = buffer
                                    let check = await compareHash(buffer, hash_array[index])
                                    if(check) {
                                        wire.have(index)
                                        parentPort.postMessage({store: true, index: index, buffer: buffer})
                                        if(index * piece_length == total_length) {
                                            wire.uninterested()
                                            return true
                                        }
                                    } else {
                                        delete storage.index
                                    }
                                } 
                            }
                        }
                    }
                    parentPort.postMessage({end: true})  
                    wire.destroy()
                    socket.destroy()
                })
                wire.on('port', (dhtPort) => {
                    const ip = socket.remoteAddress
                    const id = peerId.toString('hex')
                    parentPort.postMessage({host: ip, port: dhtPort, id: id})
                })
            })
        })

        wire.on('request', (pieceIndex, offset, length, callback) => {
            // wire.piece(pieceIndex, offset, storage[pieceIndex])
            if(pieceIndex in storage) {
                callback(null, storage[pieceIndex])
            }
        })

        wire.on('warning', () => {
            parentPort.postMessage({warn: true})
            wire.destroy()
            socket.destroy()
        })

        wire.on('error', (err) => {
            parentPort.postMessage({err: true, msg: err})
            wire.destroy()
            socket.destroy()
        })

        socket.on('error', async (err) => {
            if(change) {
                parentPort.postMessage({err: true, msg: err})
            } else {
                let check = setTimeout(() => {
                    if(!ti) {
                        parentPort.postMessage({tcp_udp: true})
                        clearTimeout(check)
                    }
                }, 5000)
                await udp_download(ip, port, info_hash, blocks, piece_length, hash_array, total_length, storage, change=true)
            }
            wire.destroy()
            socket.destroy()
        })

        socket.on('close', () => {
            parentPort.postMessage({socketClose: true})
            wire.destroy()
            socket.destroy()
        })

    })
}

async function udp_download(ip, port, info_hash, blocks, piece_length, hash_array, total_length, storage, change=false) {
    let socket = utp.connect(port, ip, () => {
        const wire = new Protocol()
        socket.setKeepAlive(true, 60000)
        socket.pipe(wire).pipe(socket)

        wire.use(ut_pex())

        wire.handshake(info_hash, uuidv4(), {dht: true})

        wire.on('extended', (ext, obj) => {
            if("ut_pex" in obj.m) {
                wire.ut_pex.on('peer', (peer, flags) => {
                    let ip = peer.split(':')[0]
                    let port = peer.split(':')[1]
                    const supportUdp = flags[2]
                    parentPort.postMessage({supportUdp: supportUdp, host: ip, port: port})
                })

                wire.ut_pex.on('dropped', (peer) => {
                    let ip = peer.split(':')[0]
                    parentPort.postMessage({dropped: true, host: ip})
                })

            }
        })

        wire.on('handshake', async (infoHash, peerId, extensions) => {
            wire.interested()
            wire.port(udp_port)
            wire.on('unchoke', () => {
                wire.on('bitfield', async bitfield => {
                    while(storage.length < bitfield.length) {                  
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
                                            return true
                                        }
                                    } else {
                                        delete storage.index
                                    }
                                } 
                            }
                        }
                    }   
                    parentPort.postMessage({end: true})
                    wire.destroy()
                    socket.destroy()
                })
                wire.on('port', (dhtPort) => {
                    const ip = socket.remoteAddress
                    const id = peerId.toString('hex')
                    parentPort.postMessage({host: ip, port: dhtPort, id: id})
                })
            })
        })

        wire.on('request', (pieceIndex, offset, length, callback) => {
            // wire.piece(pieceIndex, offset, storage[pieceIndex])
            if(pieceIndex in storage) {
                callback(null, storage[pieceIndex])
            }
        })

        wire.on('warning', () => {
            parentPort.postMessage({warn: true})
            wire.destroy()
            socket.destroy()
        })

        wire.on('error', (err) => {
            parentPort.postMessage({err: true, msg: err})
            wire.destroy()
            socket.destroy()
        })

        socket.on('error', async (err) => {
            if(change) {
                parentPort.postMessage({err: true, msg: err})
            } else {
                let check = setTimeout(() => {
                    if(!ti) {
                        parentPort.postMessage({tcp_udp: true})
                        clearTimeout(check)
                    }
                }, 5000)
                await tcp_download(ip, port, info_hash, blocks, piece_length, hash_array, total_length, storage, change=true)
            }
            wire.destroy()
            socket.destroy()
        })

        socket.on('close', () => {
            parentPort.postMessage({socketClose: true})
            wire.destroy()
            socket.destroy()
        })
    })
}

async function compareHash(buffer, hash_array) {
    let hash = crypto.createHash('sha1').update(buffer).digest()
    if(hash.equals(hash_array)) {
        return true
    }
}

parentPort.on('message', async (msg) => {
    if(msg.supporUdp == true) {
        await udp_download(msg.supporUdp, msg.ip, msg.port, msg.info_hash, msg.blocks, msg.piece_length, msg.hash_array, msg.total_length, msg.storage)
    } else {
        await tcp_download(msg.supporUdp, msg.ip, msg.port, msg.info_hash, msg.blocks, msg.piece_length, msg.hash_array, msg.total_length, msg.storage)
    }
})