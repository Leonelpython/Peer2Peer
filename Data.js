import { update, writefile } from "./threads/disk.js";
import ParseTorrent from "parse-torrent";
import { pool } from "./BD/db.js";
import { worker } from "cluster";
import { dht_ip, dht_hash } from "./Servers/server.js";

let h;
let p;
let info_hash;
let name;
let main_worker;
let ext_worker;
let store;
let metadata;
let by_name = false

const queue = []
let queue_already = Set()

export let nodesIp = Set()
let infoHash_found = Set()
export let droppedIp = Set()

let supporUdp = true
let connected = 0
let found = {}

async function Downloader(supporUdp=true, ip, port, main_worker, metadata, store) {
    return new Promise((resolve, reject) => {
        let res = false
        let wait = setTimeout(async () => {
            if(!res) {
                clearTimeout(wait)
                main_worker.destroy()
                reject()
            }
        }, 15000)

        main_worker.postMessage({supporUdp: supporUdp, ip_addr: ip, port: port, info_hash: metadata.info_hash, blocks: metadata.blocks, piece_length: metadata.piece_length, hash_array: metadata.hash_array, filename: metadata.filename, total_length: metadata.total_length, storage: store})
        main_worker.on('online', () => {
            console.log(`worker ${item} started`)
        })
        main_worker.on("message", async (msg) => {
            await message(msg)
        })
        main_worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
        })
        main_worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
        })
    })
}

async function GetMetadataByIPPort(supporUdp=true, infoHash, ip, port, main_worker, ext_worker) {
    return new Promise((resolve, reject) => {
        let sent = false
        let got = false
        let data;
        let wait = setTimeout(async () => {
            if(!got & !sent) {
                clearTimeout(wait)
                reject()
            }
        }, 20000)
        main_worker.postMessage({supporUdp: supporUdp, ip_addr: ip, port: port})
        main_worker.on('online', () => {
            console.log(`worker metadata started`)
        })
        main_worker.on("message", async (msg) => {
            if(msg.obj) {
                if(!"ut_metadata" in msg.m & !"ut_pex" in msg.m) {
                    droppedIp.push(msg.host)
                    reject()
                    if(wait) {
                        clearTimeout(wait)
                    }
                }
                connected--
            }
            if(msg.meta) {
                droppedIp.push(msg.host)
                reject()
                if(wait) {
                    clearTimeout(wait)
                }
                connected--
            }
            if(msg.peer_connect) {
                sent = true
            }
            if(msg.buffer) {
                got = true
                await buff(ext_worker)
                resolve()
            }
        })
        main_worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
        })
        main_worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
        })
    })
}

async function GetMetadataByHash(infoHash, main_worker, ext_worker, name=null, by_name=false) {
    return new Promise((resolve, reject) => {
        let got = false
        let wait = setTimeout(() => {
            if(!got) {
                reject()
                clearTimeout(wait)
            }
        }, 15000)
        main_worker.postMessage({supporUdp: false, infoHash: infoHash})
        main_worker.on('online', () => {
            console.log(`worker metadata by name started`)
        })
        main_worker.on('message', async (msg) => {
            await message(msg)
            if(msg.metadata) {
                reject()
                if(wait) {
                    droppedIp.push(msg.host)
                    if(wait) {
                        clearTimeout(wait)
                    }
                }
            }
            if(msg.Buffer) {
                let data = await buff(ext_worker)
                if(by_name) {
                    resolve(data)
                }
            }
        })
        main_worker.on('error', (err) => {
            worker.postMessage({supporUdp: true, infoHash: infoHash})
            console.log(`worker metadata by name error: ${err}`)
            reject(err)
        })
        main_worker.on('exit', (code) => {
            console.error(`worker metadata by name exited with code: ${code}`)
            reject(code)
        })
    })
}

export async function GetTorrentData(file) {
    const torrent = ParseTorrent(fs.readFileSync(file))

    const info_hash = torrent.infoHash
    const piece_length = torrent.pieceLength
    const total_length = torrent.length
    const pieces = Math.ceil(total_length / piece_length)
    const hash_array = torrent.info.pieces
    const filename = torrent.files[0]

    return {infoHash: info_hash, filename: filename, total_length: total_length, piece_length: piece_length, pieces: pieces, hash_array: hash_array}
}

export let obj = {
    "metadata_byhash": await GetMetadataByHash(info_hash, main_worker, ext_worker),
    "metadata_hash_byname": await GetMetadataByHash(info_hash, main_worker, ext_worker, name, by_name=true),
    "metadata_byIPPort": await GetMetadataByIPPort(supporUdp=true, info_hash, h, p, main_worker, ext_worker),
    "download": await Downloader(supporUdp=true, h, p, main_worker, metadata, store)
}

export async function start(key, main_workers, infoHash=null, ext_workers=null, names=null, by_names=false, host=null, port=null, storage=null, metadatas=null, supportUdp=true) {
    main_worker = main_workers
    ext_worker = ext_workers
    info_hash = infoHash
    name = names
    store = storage
    metadata = metadatas
    by_name = by_names
    supporUdp = supportUdp
    h = host
    p = port
    let result = null
    if(connected > 100) {
        let int = setInterval(async () => {
            if(connected < 100) {
                while(connected < 100 & queue.length > 0) {
                    h = queue[0].host
                    p = queue[0].port
                    result = obj[key]
                    delete queue[0]
                    connected++
                }
                clearInterval(int)
            } 
            if(!h in queue_already) {
                queue.push({host: h, port: p, supporUdp: supporUdp})
                queue_already.push(h)
            }
        }, 1000)
    } else{
        result = obj[key]
        connected++
    }
    return result
}

async function message(msg, ext_worker, connected) {
    if(msg.warn) {
        reject()
        if(wait) {
            clearTimeout(wait)
        }
        connected--
    }
    if(msg.end) {
        resolve()
        if(wait) {
            droppedIp.push(msg.host)
            clearTimeout(wait)
        }
        connected--
    }
    if(msg.dropped) {
        droppedIp.push(msg.host)
    }
    if(msg.tcp_udp) {
        reject()
        if(wait) {
            clearTimeout(wait)
        }
        connected--
    }
    if(msg.handshake) {
        reject()
        if(wait) {
            clearTimeout(wait)
        }
        connected--
    }
    if(msg.socketClose) {
        reject()
        clearTimeout(check)
        connected--
    } else if(msg.err) {
        reject()
        clearTimeout(check)
        connected--
    } else if(msg.update) {
        update('node-bittorents.json', dht_ip.toJson().nodes)
    } else if(msg.peer) {
        sent = true
        if(msg.host in nodesIp & !msg.supporUdp) {
            dht_ip.addNode({host: msg.host, port: msg.port})
        }
        let int = setInterval(async () => {
            if(connected < 100) {
                if(msg.supporUdp == true) {
                    nodesIp.push(msg.host)
                    await GetMetadataByIPPort(msg.supporUdp, infoHash, msg.host, msg.port, main_worker, ext_worker)
                } else {
                    await GetMetadataByIPPort(queue[0].supporUdp, infoHash, queue[0].host, queue[0].port, main_worker, ext_worker)
                    delete queue[0]
                }
                connected++
                clearInterval(int)
            } else {
                if(msg.host != queue_already) {
                    queue.push({host: msg.host, port: msg.port, supporUdp: msg.supporUdp})
                    queue_already.push(msg.host)
                }
            }
        }, 1000)
    }
}

async function buff(ext_worker, data) {
    if(ext_index > 3) {
        ext_index = 0
    }
    ext_worker.postMessage({buffer: msg.buffer})
    ext_index++
    ext_worker.on('message', async (ext_msg) => {
        if(by_name) {
            console.log(`ext message: ${ext_msg}`)
            ext_msg["infoHash"] = infoHash
            data = ext_msg
            return data
        }
        await pool.query(`insert into users(filename, infoHash, total_length, pieces_length, hashArray) values($1, $2, $3, $4, $5)`, [ext_msg.filename, infoHash, ext_msg.total_length, ext_msg.piece_length, ext_msg.hash_array])
        infoHash_found.push(msg.host)
        delete found[infoHash]
        resolve(ext_msg)
    })
    ext_worker.on('error', (err) => {
        console.log(`worker metadata by name error: ${err}`)
        rejects(err)
    })
    ext_worker.on('exit', (code) => {
        console.error(`worker metadata by name exited with code: ${code}`)
        rejects(code)
    })
}
