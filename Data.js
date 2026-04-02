import { update, writefile } from "./threads/disk.js";
import ParseTorrent from "parse-torrent";
import { pool } from "./BD/db.js";
import { dht_ip, dht_hash } from "./Servers/server.js";
import { Worker } from "worker_threads";

let maxUsers = 450

let hash_users = 400
let ip_users = 50

export let connected = 0
export let dropped_length = 0

let h;
let p;
let info_hash;
let main_worker;
let ext_worker;
let store;
let metadata;
let wq;
let server_port;
let goal;
let by_name = false
let supporUdp = true

const queue_already = new Set()

export const nodesIp = new Set()
export const infoHash_found = new Set()
export const droppedIp = new Set()

export const queue_hash = []
export const queue_users = []

const servers = []
const ports = []

export const hash_workers = []
export const IPPort_workers = []
export const extract_workers = []
export const disk_workers = []

export async function createThreads(threads_name, threads_number) {
    for(let i = 0; i < threads_number.length; i++) {
        if(i < threads_number[i]) {
            if("extract_workers" in threads_name) extract_workers.push(new Worker(threads_name["extract_workers"]))
            if("hash_workers" in threads_name) hash_workers.push(new Worker(threads_name["hash_workers"]))
            if("IPPort_workers" in threads_name) IPPort_workers.push(new Worker(threads_name["IPPort_workers"]))
            if("disk_workers" in threads_name) disk_workers.push(new Worker(threads_name["disk_workers"]))
        }
        servers[i] = false
        ports[i] = 50000 + i
    }
    return true
}

export async function Downloader(supporUdp, ip, port, main_worker, metadata, store, which_queue) {
    console.log('in downloader')
    return new Promise((resolve, reject) => {
        main_worker.postMessage({supporUdp: supporUdp, ip_addr: ip, port: port, info_hash: metadata.info_hash, blocks: metadata.blocks, piece_length: metadata.piece_length, hash_array: metadata.hash_array, filename: metadata.filename, total_length: metadata.total_length, storage: store})
        main_worker.on('online', () => {
            connected++
        })
        main_worker.on("message", async (msg) => {
            if(msg.store) store[msg.index].push(msg.buffer)
            if(msg.end) {
                await writefile(`${metadata.filename}`, store, metadata.piece_length)
                resolve()
                connected--
            }
            if(msg.dropped) droppedIp.push(msg.host)
            if(msg.update) update('node-bittorents.json', dht_ip.toJson().nodes)
            let mes = await message(msg, null, main_worker, null, null, metadata, store, which_queue)
            if(!mes) {
                reject()
                droppedIp.push(msg.host)
                connected--
            }
        })
        main_worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
            connected--
        })
        main_worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
            connected--
        })
    })
}

export async function GetMetadataByIPPort(supporUdp, ip, port, main_worker, ext_worker, which_queue) {
    return new Promise((resolve, reject) => {
        let sent = false
        let got = false
        let wait = setTimeout(async () => {
            if(!got & !sent) {
                clearTimeout(wait)
                reject()
                connected--
            }
        }, 20000)
        main_worker.postMessage({supporUdp: supporUdp, ip_addr: ip, port: port})
        main_worker.on('online', () => {
            connected++
        })
        main_worker.on("message", async (msg) => {
            await message(msg, wait, main_worker, ext_worker, infoHash, null, null, which_queue)
            if(msg.dropped) {
                droppedIp.push(msg.host)
            }
            if(msg.update) {
                update('node-bittorents.json', dht_ip.toJson().nodes)
            }
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
                let data = await buff(ext_worker)
                resolve(data)
                connected--
            }
        })
        main_worker.on('error', (err) => {
            console.error(`error thread ${item}: ${err}`)
            reject(err)
            connected--
        })
        main_worker.on('exit', (code) => {
            console.error(`thread exited with code: ${code}`)
            connected--
        })
    })
}

export async function GetMetadataByHash(infoHash, main_worker, ext_worker, by_name=false, which_queue, server_port, goal) {
    console.log('in hash')
    return new Promise((resolve, reject) => {
        let got = false
        let wait = setTimeout(() => {
            if(!got) {
                reject()
                clearTimeout(wait)
                connected--
            }
        }, 20000)
        main_worker.postMessage({supporUdp: false, infoHash: infoHash, goal: goal, port: server_port})
        main_worker.on('online', () => {
            console.log(`thread hash started`)
            connected++
        })
        main_worker.on('message', async (msg) => {
            let mes = await message(msg, wait, main_worker, ext_worker, infoHash, null, null, which_queue)
            if(!mes) {
                reject()
                connected--
            }
            if(msg.metadata) {
                reject()
                if(wait) {
                    droppedIp.push(msg.host)
                    if(wait) {
                        clearTimeout(wait)
                    }
                }
                connected--
            }
            if(msg.Buffer) {
                got = true
                let data = await buff(ext_worker, infoHash, by_name)
                if(data[0] != null) {
                    resolve(data)
                }
                if(data[1] != null) {
                    reject(data)
                }
                if(data[2] != null) {
                    reject(data)
                }
                connected--
            }
        })
        main_worker.on('error', (err) => {
            worker.postMessage({supporUdp: true, infoHash: infoHash})
            console.error(`worker metadata by name error: ${err}`)
            reject(err)
            connected--
        })
        main_worker.on('exit', (code) => {
            console.error(`worker metadata by name exited with code: ${code}`)
            reject(code)
            connected--
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

async function obj(key) {
    if(key == "download") await Downloader(supporUdp=supporUdp, h, p, main_worker, metadata, store, wq)
    if(key == "metadata_byhash") await GetMetadataByHash(info_hash, main_worker, ext_worker, wq, server_port, goal)
    if(key == "metadata_hash_byname") await GetMetadataByHash(info_hash, main_worker, ext_worker, by_name=by_name, wq, server_port, goal)
    if(key == "metadata_byIPPort") await GetMetadataByIPPort(supporUdp=supporUdp, h, p, main_worker, ext_worker, wq)
}

export async function start(key, main_workers, infoHash=null, ext_workers=null, by_names=false, host=null, port=null, storage=null, metadatas=null, supportUdp=true, which_queue=null, server_ports=null, thread_goal=null) {
    main_worker = main_workers
    ext_worker = ext_workers
    info_hash = infoHash
    store = storage
    metadata = metadatas
    by_name = by_names
    supporUdp = supportUdp
    h = host
    p = port
    wq = which_queue
    server_port = server_ports
    goal = thread_goal
    let result;
    if(connected > maxUsers) {
        let int = setInterval(async () => {
            if(connected < maxUsers) {
                let users_length = queue_users.length
                let hash_length = queue_hash.length
                while(connected < maxUsers & (hash_length > 0 || users_length > 0)) {
                    if(hash_users % 40 == 0 & (hash_users != 0 & hash_length > 0)) {
                        h = queue_hash[0].host
                        p = queue_hash[0].port
                        result = await obj(key)
                        delete queue_hash[0]
                        hash_users--
                        break
                    } else if(ip_users % 5 == 0 & (users_length > 0 & ip_users > 0)) {
                        h = queue_users[0].host
                        p = queue_users[0].port
                        result = await obj(key)
                        delete queue_users[0]
                        ip_users--
                        break
                    } else {
                        hash_users = 400
                        ip_users = 50
                    }
                }
                clearInterval(int)
            } 
            if(!h in queue_already) {
                if("users" in which_queue) {
                    queue_users.push({host: h, port: p, supporUdp: supporUdp})
                    queue_already.push(h)
                } else {
                    queue_hash.push({host: h, port: p, supporUdp: supporUdp})
                    queue_already.push(h)
                }
            }
        }, 1000)
    } else{
        result = await obj(key)
        connected++
    }

    result.then((data) => {
        return data
    }).catch((err) => {
        return err
    })
}

async function message(msg, wait, main_worker, ext_worker=null, infoHash, metadata=null, store=null, which_queue) {
    if(msg.warn) {
        if(wait) {
            clearTimeout(wait)
        }
        return false
    }
    if(msg.tcp_udp) {
        if(wait) {
            clearTimeout(wait)
        }
        return false
    }
    if(msg.handshake) {
        if(wait) {
            clearTimeout(wait)
        }
        return false
    }
    if(msg.socketClose) {
        clearTimeout(check)
        return false
    } else if(msg.err) {
        console.error(`error ${which_queue}: ${msg.msg}`)
        clearTimeout(check)
        return false
    } else if(msg.peer) {
        sent = true
        if(msg.host in nodesIp & !msg.supporUdp) {
            dht_ip.addNode({host: msg.host, port: msg.port})
        }
        if(ext_worker != null) {
            await start("metadata_byIPPort", main_worker, infoHash, ext_worker, false, msg.host, msg.port, null, null, msg.supporUdp, which_queue)
        } else {
            await start("download", main_worker, null, null, false, msg.host, msg.port, store, metadata, msg.supporUdp, which_queue)
        }
    } else {
        return null
    }
}

async function buff(ext_worker, infoHash) {
    if(ext_index > 3) {
        ext_index = 0
    }
    ext_worker.postMessage({buffer: msg.buffer})
    ext_index++
    ext_worker.on('message', async (ext_msg) => {
        ext_msg["infoHash"] = infoHash
        let rows = await pool.query(`insert into users(filename, infoHash, total_length, pieces_length, hashArray, timestamp) values($1, $2, $3, $4, $5) returning *`, [ext_msg.filename, infoHash, ext_msg.total_length, ext_msg.piece_length, ext_msg.hash_array, new Date()])
        infoHash_found.push(msg.host)
        return (ext_msg, null, null)
    })
    ext_worker.on('error', (err) => {
        console.error(`worker metadata by name error: ${err}`)
        return (null, err, null)
    })
    ext_worker.on('exit', (code) => {
        console.error(`worker metadata by name exited with code: ${code}`)
        return (null, null, code)
    })
}

// async function announce(infoHash) {
//     dht_hash.announce(infoHash, server.address().port, (err) => {
//         if(err) {
//             parentPort.postMessage({err: err})
//         }
//     })
// }
