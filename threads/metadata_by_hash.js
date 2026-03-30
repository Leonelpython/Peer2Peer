import net from "net"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import ut_metadata from "ut_metadata"
import utp from "utp-native"
// import natupnp from "nat-upnp"

// let client = natupnp.createClient()

// client.portMapping({
//     public: 6881,
//     private: 6881,
//     ttl: 3600
// }, (err) => {
//     if(err) {
//         parentPort.postMessage({mappingerr: err})
//     }
// })

let tu = false
let hs = false
let ma = false

let tcp_udp_timeout = setTimeout(() => {
    if(!tu) {
        parentPort.postMessage({tcp_udp: true})
        clearTimeout(tcp_udp_timeout)
    }
}, 5000)

// process.on('SIGINT', () => {
//     client.portUnmapping({public: 6881})
//     process.exit()
// })

async function getMetadataTcp(infoHash, change=false) {
    net.createServer(socket => {
        tu = true
        clearTimeout(tcp_udp_timeout)

        const wire = new Protocol()

        socket.setKeepAlive(true, 45000)
        socket.pipe(wire).pipe(socket)

        wire.use(ut_metadata())

        let check = setTimeout(() => {
            if(!hs) {
                parentPort.postMessage({handshake: true})
                clearTimeout(check)
                socket.destroy()
            }
        }, 2000);

        wire.handshake(infoHash, uuid4(), {dht: true})

        wire.on('extended', (ext, obj) => {
            if(!"ut_metadata" in obj.m) {
                parentPort.postMessage({metadata: false})
            } else {
                let check = setTimeout(() => {
                    if(!ma) {
                        parentPort.postMessage({meta: true})
                        socket.destroy()
                        clearTimeout(check)
                    }
                }, 5000)

                wire.ut_metadata.fetch()

                wire.ut_metadata.on('metadata', buffer => {
                    ma = true
                    parentPort.postMessage({buffer: buffer})
                    wire.destroy()
                    socket.destroy()
                })
            }
        })

        wire.on('handshake', (infoHash, peerId, extensions) => {
            hs = true
        })

        wire.on('error', async (err) => {
            wire.destroy()
            socket.destroy()
        })

        wire.on('warning', () => {
            parentPort.postMessage({warn: true})
            wire.destroy()
            socket.destroy()
        })

        socket.on('error', async (err) => {
            if(change) {
                parentPort.postMessage({err: true, msg: err})
            } else {
                clearTimeout(tcp_udp_timeout)
                ti = false
                let tcp_udp_timeout = setTimeout(() => {
                    if(!ti) {
                        parentPort.postMessage({tcp_udp: true})
                        clearTimeout(tcp_udp_timeout)
                    }
                }, 5000)
                await getMetadataUdp(infoHash, change=true)
            }
            wire.destroy()
            socket.destroy()
        })

        socket.on('close', () => {
            parentPort.postMessage({socketClose: true})
            wire.destroy()
            socket.destroy()
        })
    }).listen(6881)
}

async function getMetadataUdp(infoHash, change=false) {
    utp.createServer(socket => {
        tu = true
        clearTimeout(tcp_udp_timeout)

        const wire = new Protocol()

        socket.setKeepAlive(true, 45000)
        socket.pipe(wire).pipe(socket)

        let check = setTimeout(() => {
            if(!hs) {
                parentPort.postMessage({handshake: true})
                clearTimeout(check)
                socket.destroy()
            }
        }, 2000);

        wire.handshake(infoHash, uuid4(), {dht: true})

        wire.use(ut_metadata())

        wire.on('extended', (ext, obj) => {
            if(!"ut_metadata" in obj.m.toString()) {
                parentPort.postMessage({metadata: false})
            } else {
                let check = setTimeout(() => {
                    if(!ma) {
                        parentPort.postMessage({meta: true})
                        socket.destroy()
                        clearTimeout(check)
                    }
                }, 5000)

                wire.ut_metadata.fetch()

                wire.ut_metadata.on('metadata', buffer => {
                    ma = true
                    parentPort.postMessage({buffer: buffer})
                    wire.destroy()
                    socket.destroy()
                })
            }
        })

        wire.on('handshake', (infoHash, peerId, extensions) => {
            hs = true
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
                clearTimeout(tcp_udp_timeout)
                ti = false
                let tcp_udp_timeout = setTimeout(() => {
                    if(!ti) {
                        parentPort.postMessage({tcp_udp: true})
                        clearTimeout(tcp_udp_timeout)
                    }
                }, 5000)
                await getMetadataTcp(infoHash, change=true)
            }
            wire.destroy()
            socket.destroy()
        })

        socket.on('close', () => {
            parentPort.postMessage({socketClose: true})
            wire.destroy()
            socket.destroy()
        })
    }).listen(6881)
}

parentPort.on('message', async (msg) => {
    if(msg.supportUdp == true) {
        await getMetadataUdp(msg.infoHash)
    } else {
        await getMetadataTcp(msg.infoHash)
    }
})