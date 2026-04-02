import net from "net"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import ut_metadata from "ut_metadata"
import utp from "utp-native"
import natupnp from "nat-upnp"

let client = natupnp.createClient()

let tu = false
let hs = false
let ma = false

let tcp_udp_timeout = setTimeout(() => {
    if(!tu) {
        parentPort.postMessage({tcp_udp: true})
        clearTimeout(tcp_udp_timeout)
    }
}, 5000)

let catalogue = new Map()

async function getMetadataTcp(port, change=false) {
    console.log('tcp')
    let server = net.createServer(socket => {
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

        wire.on('handshake', (infoHash, peerId, extensions) => {
            if(catalogue.has(infoHash)) {
                wire.handshake(infoHash, uuid4(), {dht: true})
                hs = true
            }

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
        })

        wire.on('error', async (err) => {
            parentPort.postMessage({err: err})
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
    }).listen(port)
}

async function getMetadataUdp(port, change=false) {
    console.log('in udp')
    let server = utp.createServer(socket => {
        tu = true
        clearTimeout(tcp_udp_timeout)

        const wire = new Protocol()

        socket.setKeepAlive(true, 45000)
        socket.pipe(wire).pipe(socket)

        let check = setTimeout(() => {
            if(!hs) {
                parentPort.postMessage({handshake: true})
                clearTimeout(check)
                wire.destroy()
                socket.destroy()
            }
        }, 2000);

        wire.use(ut_metadata())

        wire.on('extended', (ext, obj) => {
            if(!"ut_metadata" in obj.m.toString()) {
                parentPort.postMessage({metadata: false})
            } else {
                let check = setTimeout(() => {
                    if(!ma) {
                        parentPort.postMessage({meta: true})
                        wire.destroy()
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
            if(catalogue.has(infoHash)) {
                wire.handshake(infoHash, uuid4(), {dht: true})
                hs = true
            } else {
                parentPort.postMessage({err: 'infoHash no match'})
                wire.destroy()
                socket.destroy()
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
    }).listen(port)
}

parentPort.on('message', async (msg) => {
    await openPort(msg.port)
    if(msg.goal == 'announce') {
        catalogue.set(msg.infoHash, msg.infoHash)
    } else {
        if(msg.supportUdp == true & msg.createserver) {
            await getMetadataUdp(msg.port)
        } else {
            await getMetadataTcp(msg.port)
        }
        catalogue.set(msg.infoHash, msg.infoHash)
    }
})

async function openPort(port) {
    client.portMapping({
        public: port,
        private: port,
        ttl: 3600
    }, (err) => {
        if(err) {
            parentPort.postMessage({err: err})
        }
    })

    process.on('SIGINT', () => {
        client.portUnmapping({public: port, private: port})
        process.exit()
    })
}