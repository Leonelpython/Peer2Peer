import LSD from "bittorrent-lsd";
import DHT from "bittorrent-dht";
import Tracker from "bittorrent-tracker"
import { start, infoHash_found, droppedIp, nodesIp, connected, queue_hash, queue_users, dropped_length } from "../Data.js";

export let dht_ip;
export let dht_hash;
let index = 0
let ext_index = 0

let allpeers = 0
let announcement = 0
let dht_ip_peers = 0
let tracker_peers = 0
let lsd_peers = 0

let clean_queue = null

if(fs.existsSync('nodes-bittorents.json')) {
    let bootstrap = fs.readFileSync('nodes-bittorents.json')
    dht_ip = new DHT({
        bootstrap: JSON.parse(bootstrap),
        maxAge: 1800000,
        concurrency: 128
    })

    dht_hash = new DHT({
        bootstrap: JSON.parse(bootstrap),
        maxAge: 1800000,
        concurrency: 128
    })
} else{
    dht_hash = new DHT({
        maxAge: 1800000,
        concurrency: 128,
        verify: buffer.alloc(0)
    })

    dht_ip = new DHT({
        maxAge: 1800000,
        concurrency: 128
    })
}

export async function DhtByHash(main_worker, ext_worker, other_worker, info_hash=null, name=null, by_name=false, storage=null, metadata=null, supportUdp=true, shared=false) {
    let every_second = setInterval(() => {
        dht_hash.on("announcement", async (infoHash, port) => {
            await display()

            if(clean_queue != null) {
                return
            }

            if(queue_hash.length > 11000000 || queue_users.length > 11000000) {
                clean_queue = setInterval(() => {
                    if(queue_hash.length > 100000 & queue_users.length > 100000) {
                        clearInterval(clean_queue)
                        clean_queue = null
                    }
                }, 1000)
            }

            if(announcement % 5000 == 0) {
                return
            }
            if(!infoHash in infoHash_found) {
                if(index > main_worker.length) {
                    index = 0
                }
                if(ext_index > ext_worker.length) {
                    ext_index = 0
                }
                if(by_name) {
                    let metadata = await start("metadata_hash_byname", main_worker[index], infoHash.toString('hex'), ext_worker[ext_index], by_name, null, null, storage, metadata, supportUdp, "hash")
                    if(name in metadata.filename) {
                        dht_hash.destroy()
                        return infoHash
                    }
                    index++
                    ext_index++
                    return result
                } else {
                    console.log(`main worker: ${main_worker}`)
                    console.log(`main worker index: ${main_worker[index]}`)

                    await start("metadata_byhash", main_worker[index], infoHash.toString('hex'), ext_worker[ext_index], by_name, null, null, storage, metadata, supportUdp, "hash")
                    if(shared) {
                        await dhtByIpPort("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)
                        await Lsd("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)
                        await tracker("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)

                    }
                    index++
                    ext_index++
                }
                announcement++
            }
        })
    }, 1000)

    dht_hash.listen(20000, () => {
        console.log(`listinning port 2000 udp`)
    })
}

export async function dhtByIpPort(key, main_worker, info_hash, ext_worker=null, storage=null, metadata=null, supportUdp=true, shared=false) {
    let wait = setInterval(() => {
        dht_ip.on('peer', async (peer, infoHash, from) => {
            await display()

            if(index > main_worker.length) {
                index = 0
            }
            if(ext_index > ext_worker.length) {
                ext_index = 0
            }

            let host = peer.host
            let port = peer.port

            if(!host in droppedIp & !host in nodesIp) {
                await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, host, port, storage, metadata, supportUdp, "users")
                if(shared) {
                    await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                    await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                    await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                }
                index++
                ext_index++
            }
            dht_ip_peers++
            allpeers++
        })
    }, 1000)

    dht_ip.listen(20000, () => {
        console.log(`dht listining http://localhost:3000`)
    })

    dht_ip.lookup(info_hash)

}

export async function tracker(key, main_worker, info_hash=null, ext_worker=null, storage=null, metadata=null, supportUdp=true, shared=false) {
    const opts = {
        infoHash: info_hash,
        peerId: uuidv4(),
        announce: ['udp://:tracker.openbittorrent.com'],
        port: 6881
    }
    const client = new Tracker(opts)
    client.start()

    client.on('peer', async (addr) => {
        await display()

        if(index > main_worker.length) {
            index = 0
        }
        if(ext_index > ext_worker.length) {
            ext_index = 0
        }

        let host = addr.split(':')[0]
        let port = addr.split(':')[1]

        if(!host in droppedIp & !host in nodesIp) {
            await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, host, port, storage, metadata, supportUdp, "users")
            if(shared) {
                await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
            }
            index++
            ext_index++
        }
        tracker_peers++
        allpeers++
    })
}

export async function Lsd(key, main_worker, info_hash=null, ext_worker=null, storage=null, metadata=null, supportUdp=true, shared=false) {
    const lsd = new LSD(info_hash)
    lsd.start()

    lsd.on('peer', async (ip, port) => {
        await display()
        if(index > main_worker.length) {
            index = 0
        }
        if(ext_index > ext_worker.length) {
            ext_index = 0
        }

        if(!host in droppedIp & !host in nodesIp) {
            await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, ip, port, storage, metadata, supportUdp, "users")
            if(shared) {
                await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
            }
            index++
            ext_index++
        }
        lsd_peers++
        allpeers++
    })
}

async function display() {
    console.log(`\rusers connected: ${connected}`)
    console.log(`\rqueue users length: ${queue_users.length}`)
    console.log(`\rqueue hash length: ${queue_hash.length}`)
    console.log(`\rdropped id: ${dropped_length}`)

    console.log(`\rdht_ip peers got: ${dht_ip_peers}`)
    console.log(`\rtracker peers got: ${tracker_peers}`)
    console.log(`\rlsd peers got: ${lsd_peers}`)
    console.log(`\rall announcement: ${announcement}`)
    console.log(`\rall peers got: ${allpeers}`)
}