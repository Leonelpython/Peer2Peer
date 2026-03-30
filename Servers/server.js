import LSD from "bittorrent-lsd";
import DHT from "bittorrent-dht";
import Tracker from "bittorrent-tracker"
import { start, info_hash, infoHash_found, droppedIp, nodesIp } from "../Data.js";

export let dht_ip;
export let dht_hash;

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

export async function dhtByIpPort(key, main_worker, info_hash, ext_worker=null, name=null, by_name=false, metadata=null, storage=null, shared=false) {
    dht_ip.on('peer', async (peer, infoHash, from) => {
        host = peer.host
        port = peer.port

        if(!host in droppedIp & !host in nodesIp) {
            await start(key=key, main_workers=main_worker, infoHash=info_hash, ext_workers=ext_worker, names=name, by_names=by_name, host=host, port=port, storage=storage, metadatas=metadata)
            // clearTimeout(tim)
        }
    })

    dht_ip.listen(20000, () => {
        console.log(`dht listining http://localhost:3000`)
    })

    dht_ip.lookup(info_hash)
}

export async function DhtByHash(main_worker, ext_worker, other_worker, info_hash=null, name=null, by_name=false, metadata=null, storage=null, shared=false) {
    dht_hash.on("announcement", async (infoHash, port) => {
        if(!infoHash in infoHash_found) {
            if(by_name) {
                let result = await start("metadata_hash_byname", main_worker, infoHash.toString('hex'), ext_worker, name, by_names=by_name)
                dht_hash.destroy()
                return result
            } else {
                if(shared) {
                    await tracker(key="metadata_byIPPort", main_worker=other_worker, info_hash=infoHash, ext_worker=ext_worker)
                    await Lsd(key="metadata_byIPPort", main_worker=other_worker, info_hash=infoHash, ext_worker=ext_worker)
                    await dhtByIpPort(key="metadata_byIPPort", main_worker=other_worker, info_hash=infoHash, ext_worker=ext_worker)
                }
                await start("metadata_byhash", main_worker, infoHash.toString('hex'), ext_worker)
            }
        }
    }, 50)

    dht_hash.listen(20000, () => {
        console.log(`listinning port 2000 udp`)
    })
}

export async function tracker(key, main_worker, info_hash=null, ext_worker=null, name=null, by_name=false, storage=null, metadata=null, shared=false) {
    const opts = {
        infoHash: info_hash,
        peerId: uuidv4(),
        announce: ['udp://:tracker.openbittorrent.com'],
        port: 6881
    }
    const client = new Tracker(opts)
    client.start()

    client.on('peer', async (addr) => {
        host = addr.split(':')[0]
        port = addr.split(':')[1]

        if(!host in droppedIp & !host in nodesIp) {
            await start(key=key, main_workers=main_worker, infoHash=info_hash, ext_workers=ext_worker, names=name, by_names=by_name, host=host, port=port, storage=storage, metadatas=metadata)
        }
    })
}

export async function Lsd(key, main_worker, info_hash=null, ext_worker=null, name=null, by_name=false, storage=null, metadata=null, shared=false) {
    const lsd = new LSD(info_hash)
    lsd.start()

    lsd.on('peer', async (ip, port) => {
        if(!host in droppedIp & !host in nodesIp) {
            await start(key=key, main_workers=main_worker, infoHash=info_hash, ext_workers=ext_worker, names=name, by_names=by_name, host=host, port=port, storage=storage, metadatas=metadata)
        }
    })
}