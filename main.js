import express from "express";
import Tracker from "bittorrent-tracker";
import DHT from "bittorrent-dht";
import { Worker } from "worker_threads";
import ParseTorrent from "parse-torrent";
import fs from "fs"
import { v4 as uuidv4 } from "uuid"
import Protocol from "bittorrent-protocol"
import LSD from "bittorrent-lsd"

let _dht = null
let _dhtMetadata = null

if(fs.existsSync('nodes-bittorents.json')) {
    let bootstrap = fs.readFileSync('nodes-bittorents.json')
    _dhtMetadata = new DHT({
        bootstrap: JSON.parse(bootstrap),
        maxAge: 1800000,
        concurrency: 128
    })

    _dht = new DHT({
        bootstrap: JSON.parse(bootstrap),
        maxAge: 1800000,
        concurrency: 128
    })
} else{
    _dhtMetadata = new DHT({
        maxAge: 1800000,
        concurrency: 128
    })

    _dht = new DHT({
        maxAge: 1800000,
        concurrency: 128
    })
}

const torrent = ParseTorrent(fs.readFileSync('.torrent'))

// const info_hash = torrent.infoHash
// const piece_length = torrent.pieceLength
// const total_length = torrent.length
// const blocks = Math.floor(piece_length / 16384)
// const lastblock = piece_length % 16384
// const hash_array = torrent.info.pieces
// const filename = torrent.files[0]
let metadata = {
    "info_hash": '',
    "piece_length": '',
    "total_length": '',
    "blocks": '',
    "lastblock": '',
    "hash_array": '',
    "filename": ''
}
let hasmetadata = false
let connected = 0

const storage = {}

const queue = []
const queue_already = Set()

const nodesIp = Set()

let p = 16384

let host = ''
let port = ''

let obj = {
    "metadata": await metadataGet(host, port),
    "download": await run(host, port)
}

async function run(ip, port) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./worker.js')
        worker.postMessage({ip_addr: ip, port: port, info_hash: metadata.info_hash, blocks: metadata.blocks, piece_length: metadata.piece_length, hash_array: metadata.hash_array, filename: metadata.filename, total_length: metadata.total_length, storage: storage})
        worker.on('online', () => {
            console.log(`worker ${item} started`)
        })
        worker.on("message", async (msg) => {
            if(msg.socketClose) {
                worker.destroy()
                connected--
            } else if(msg.err) {
                worker.destroy()
                connected--
            } else if(msg.end) {
                dht.destroy()
                resolve(msg.end)
                worker.destroy()
            } else if(msg.update) {
                fs.writeFileSync('nodes-bittorents.json', JSON.stringify(dht.toArray()))
            } else if(msg.host) {
                if(msg.host in nodesIp & !msg.node) {
                    dht.addNode({host: msg.host, port: msg.port, id: msg.id})
                }
                let int = setInterval(async () => {
                    if(connected < 100) {
                        if(msg.node == true) {
                            nodesIp.push(msg.host)
                            await run(msg.host, msg.port)
                        } else {
                            await run(queue[0].host, queue[0].port)
                            delete queue[0]
                        }
                        connected++
                        clearInterval(int)
                    } else {
                        if(msg.host != queue_already) {
                            queue.push({host: msg.host, port: msg.port})
                            queue_already.push(msg.host)
                        }
                    }
                }, 1000)
            } else {
                console.log(`${p}/${total_length}%`)
                p += 16384
            }
        })
        worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
        })
        worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
        })
    })
}

async function metadataGet(ip, port) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./metadata.js')
        worker.postMessage({ip_addr: ip, port: port})
        worker.on('online', () => {
            console.log(`worker metadata started`)
        })
        worker.on("message", async (msg) => {
            if(msg.socketClose) {
                worker.destroy()
                connected--
            } else if(msg.err) {
                worker.destroy()
                connected--
            } else if(msg.update) {
                fs.writeFileSync('nodes-bittorents.json', JSON.stringify(dht.toArray()))
            } else if(msg.data) {
                if(metadata.length <= 0) {
                    hasmetadata = true
                    metadata = msg.data
                }
                resolve()
                dhtMetadata.destroy()
                worker.destroy()
            } else if(msg.host) {
                if(msg.host in nodesIp & !msg.node) {
                    dht.addNode({host: msg.host, port: msg.port})
                }
                let int = setInterval(async () => {
                    if(connected < 100) {
                        if(msg.node == true) {
                            nodesIp.push(msg.host)
                            await metadataGet(msg.host, msg.port)
                        } else {
                            await metadataGet(queue[0].host, queue[0].port)
                            delete queue[0]
                        }
                        connected++
                        clearInterval(int)
                    } else {
                        if(msg.host != queue_already) {
                            queue.push({host: msg.host, port: msg.port})
                            queue_already.push(msg.host)
                        }
                    }
                }, 1000)
            } else {
                console.log(`${p}/${total_length}%`)
                p += 16384
            }
        })
        worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
        })
        worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
        })
    })
}

function tracker() {
    const opts = {
        infoHash: '',
        peerId: uuidv4(),
        announce: ['udp://:tracker.openbittorrent.com'],
        port: 6881
    }
    const client = new Tracker(opts)
    client.start()

    client.on('peer', (addr) => {
        ip_addr.push(addr.substring(0, addr.lastIndexOf(':')))
    })
}

async function dhtMetadata() {
    _dhtMetadata.on('peer', async (peer, info_hash, from) => {
        let host = peer.host
        let port = peer.port
        start("metadata", host, port)
    })

    _dhtMetadata.listen(20000, () => {
        console.log(`dht listining http://localhost:3000`)
    })

    _dhtMetadata.lookup(info_hash)
}

async function dht() {
    _dht.on('peer', async (peer, info_hash, from) => {
        let host = peer.host
        let port = peer.port

        await start("run", host, port)
    })

    _dht.listen(20000, () => {
        console.log(`dht listining http://localhost:3000`)
    })

    _dht.lookup(info_hash)
}

function ut_plex() {
    const wire = new Protocol()
    wire.use(ut_plex())
    wire.pex.on('peer', (peer) => {
    })
    wire.pex.addPeer(peer)
}

function lsd() {
    const lsd = new LSD(info_hash)
    lsd.start()

    lsd.on('peer', (ip, port) => {
        ip_addr.push(ip)
    })
}

async function start(name, host, port) {
    host = host
    port = port
    let result = null
    if(connected > 100) {
        let int = setInterval(async () => {
            if(connected < 100) {
                host = queue[0].host
                port = queue[0].port
                result = obj[name]
                delete queue[0]
                connected++
                clearInterval(int)
            } if(host != queue_already) {
                queue.push({host: host, port: port})
                queue_already.push(host)
            }
        }, 1000)
    } else{
        result = obj[name]
        connected++
    }
    return result
}

await dhtMetadata()

let check = setInterval(async () => {
    if(hasmetadata) {
        await dht()
        clearInterval(check)
    }
}, 1000)