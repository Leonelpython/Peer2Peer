import LSD from "bittorrent-lsd";
import DHT from "bittorrent-dht";
import Tracker from "bittorrent-tracker"
import { start, infoHash_found, droppedIp, nodesIp } from "../Data.js";

export let dht_ip;
export let dht_hash;
let index = 0
let ext_index = 0

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
    dht_hash.on("announcement", async (infoHash, port) => {
        if(!infoHash in infoHash_found) {
            if(index > main_worker.length) {
                index = 0
            }
            if(ext_index > ext_worker.length) {
                ext_index = 0
            }
            if(by_name) {
                let metadata = await start("metadata_hash_byname", main_worker[index], infoHash.toString('hex'), ext_worker[ext_index])
                if(name in metadata.filename) {
                    dht_hash.destroy()
                    return infoHash
                }
                index++
                ext_index++
                return result
            } else {
                await start("metadata_byhash", main_worker[index], infoHash.toString('hex'), ext_worker[ext_index])
                if(shared) {
                    await dhtByIpPort("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)
                    await Lsd("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)
                    await tracker("metadata_byIPPort", other_worker[index], info_hash, ext_worker[ext_index], by_name, storage, metadata, supportUdp)

                }
                index++
                ext_index++
            }
        }
    }, 50)

    dht_hash.listen(20000, () => {
        console.log(`listinning port 2000 udp`)
    })
}

export async function dhtByIpPort(key, main_worker, info_hash, ext_worker=null, storage=null, metadata=null, supportUdp=true, shared=false) {
    dht_ip.on('peer', async (peer, infoHash, from) => {
        if(index > main_worker.length) {
            index = 0
        }
        if(ext_index > ext_worker.length) {
            ext_index = 0
        }

        let host = peer.host
        let port = peer.port

        if(!host in droppedIp & !host in nodesIp) {
            await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, host, port, storage, metadata, supportUdp)
            if(shared) {
                await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
            }
            index++
            ext_index++
        }
    })

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
        if(index > main_worker.length) {
            index = 0
        }
        if(ext_index > ext_worker.length) {
            ext_index = 0
        }

        let host = addr.split(':')[0]
        let port = addr.split(':')[1]

        if(!host in droppedIp & !host in nodesIp) {
            await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, host, port, storage, metadata, supportUdp)
            if(shared) {
                await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
            }
            index++
            ext_index++
        }
    })
}

export async function Lsd(key, main_worker, info_hash=null, ext_worker=null, storage=null, metadata=null, supportUdp=true, shared=false) {
    const lsd = new LSD(info_hash)
    lsd.start()

    lsd.on('peer', async (ip, port) => {
        if(index > main_worker.length) {
            index = 0
        }
        if(ext_index > ext_worker.length) {
            ext_index = 0
        }

        if(!host in droppedIp & !host in nodesIp) {
            await start(key, main_worker[index], info_hash, ext_worker[ext_index], false, ip, port, storage, metadata, supportUdp)
            if(shared) {
                await dhtByIpPort(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await Lsd(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
                await tracker(key, main_worker[index], info_hash, ext_worker[ext_index], storage, metadata, supportUdp)
            }
            index++
            ext_index++
        }
    })
}