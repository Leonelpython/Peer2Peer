import net from "net"
import net from "net"
import { v4 as uuidv4 } from "uuid"
import { parentPort } from "worker_threads"
import Protocol from "bittorrent-protocol"
import ut_metadata from "ut_metadata"
import utp from "utp-native"
import ut_pex from "ut_pex"

let udp_port = 20000

let tu = false
let hs = false
let ma = false

setInterval(() => {
    parentPort.postMessage({update: true})
}, 15 * 60 * 1000)

let tcp_udp_timeout = setTimeout(() => {
    if(!tu) {
        parentPort.postMessage({tcp_udp: true})
        clearTimeout(tcp_udp_timeout)
    }
}, 5000)

async function tcp_download(ip, port) {
    // let socket;
    // if(supporUdp) {
    //     socket = utp.connect(port, ip)
    // } else {
    //     socket = net.connect(port, ip)
    // }
    let socket = net.connect(port, ip, () => {
        tu = true
        clearTimeout(tcp_udp_timeout)

        const wire = new Protocol()

        socket.setKeepAlive(true, 45000)
        socket.pipe(wire).pipe(socket)

        wire.use(ut_metadata())
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
            parentPort.postMessage({obj: obj.m})
            if("ut_metadata" in obj.m) {
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
                })

                wire.ut_metadata.on('warning', err => {
                    parentPort.postMessage({err: err.message})
                })
            }

            if("ut_pex" in obj.m) {
                let check = setTimeout(() => {
                    parentPort.postMessage({peer_connect: true})
                    clearTimeout(check)
                }, 5000)
                wire.ut_pex.on('peer', (peer, flags) => {
                    let ip = peer.split(':')[0]
                    let port = peer.split(':')[1]
                    let supporUdp = flags[2]
                    parentPort.postMessage({peer: true, host: ip, port: port, node: supporUdp})
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

            wire.on('port', (dhtPort) => {
                const ip = socket.remoteAddress
                const id = peerId.toString('hex')
                parentPort.postMessage({host: ip, port: dhtPort, id: id})
            })
        })

        wire.on('warning', () => {
                parentPort.postMessage({warn: true})
                socket.destroy()
            })

        wire.on('error', (err) => {
            parentPort.postMessage({err: true, msg: err})
            socket.destroy()
        })

        socket.on('error', async (err) => {
            if(change) {
                parentPort.postMessage({err: true, msg: err})
                socket.destroy()
            } else {
                clearTimeout(tcp_udp_timeout)
                    ti = false
                    let tcp_udp_timeout = setTimeout(() => {
                        if(!ti) {
                            parentPort.postMessage({tcp_udp: true})
                            clearTimeout(tcp_udp_timeout)
                        }
                    }, 5000)
                await udp_download(infoHash, change=true)
            }
        })

        socket.on('close', () => {
            parentPort.postMessage({socketClose: true})
            socket.destroy()
        })
    })
}

async function udp_download(ip, port, change=false) {
    let socket = utp.connect(port, ip, () => {
        const wire = new Protocol()

        socket.setKeepAlive(true, 45000)
        socket.pipe(wire).pipe(socket)

        wire.use(ut_metadata())
        wire.use(ut_pex())

        ti = true
        clearTimeout(tcp_udp_timeout)
        wire.handshake(info_hash, uuidv4(), {dht: true})

        wire.on('extended', (ext, obj) => {
            parentPort.postMessage({obj: obj.m})
            if("ut_metadata" in obj.m) {
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
                })

                wire.ut_metadata.on('warning', err => {
                    parentPort.postMessage({err: err.message})
                })
            } else {
            }

            if("ut_pex" in obj.m) {
                wire.ut_pex.on('peer', (peer, flags) => {
                    let ip = peer.split(':')[0]
                    let port = peer.split(':')[1]
                    let supporUdp = flags[2]
                    parentPort.postMessage({peer: true, host: ip, port: port, node: supporUdp})
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

            wire.on('port', (dhtPort) => {
                const ip = socket.remoteAddress
                const id = peerId.toString('hex')
                parentPort.postMessage({host: ip, port: dhtPort, id: id})
            })
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
                await tcp_download(infoHash, change=true)
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

parentPort.on('message', async (msg) => {
    let result;
    if(msg.supporUdp == true) {
        result = await udp_download(msg.supporUdp, msg.ip, msg.port)
    } else {
        result = await tcp_download(msg.supporUdp, msg.ip, msg.port)
    }
})